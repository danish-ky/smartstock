"""Guarded CSV/XLSX catalog import and download (stock/images are never imported).

Admin/Manager only. The default import is a dry-run, commit revalidates and is
all-or-nothing. Existing stock is ONLY changed by inventory movement services.
"""
import csv
from io import BytesIO, StringIO
from pathlib import Path
from zipfile import BadZipFile, ZipFile

from django.db import IntegrityError, transaction
from django.http import HttpResponse
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema
from rest_framework import serializers

from .models import Category, Product, Supplier
from .serializers import ProductSerializer

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 500
IMPORT_COLUMNS = ('sku', 'name', 'category', 'supplier', 'description', 'price', 'cost',
                  'low_stock_threshold', 'is_active')
EXPORT_COLUMNS = IMPORT_COLUMNS + ('stock', 'stock_status')
REQUIRED = {'sku', 'name', 'category', 'price'}


def _authorized(request):
    return request.user.is_superuser or request.user.role in ('admin', 'manager')


def _format(request):
    value = request.query_params.get('file_format', 'csv').strip().lower()
    if value not in ('csv', 'xlsx'):
        raise ValueError('Format must be csv or xlsx.')
    return value


def _safe_cell(value):
    # Avoid formula injection when downloaded files are opened in spreadsheet apps.
    if isinstance(value, str) and value.lstrip().startswith(('=', '+', '-', '@')):
        return "'" + value
    return value


def _document(columns, rows, kind, filename):
    if kind == 'csv':
        text = StringIO(newline='')
        writer = csv.writer(text, lineterminator='\r\n')
        writer.writerow(columns)
        for row in rows:
            writer.writerow([_safe_cell(value) for value in row])
        payload = '\ufeff'.encode('utf-8') + text.getvalue().encode('utf-8')
        content_type = 'text/csv; charset=utf-8'
    else:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment
        from openpyxl.utils import get_column_letter
        wb = Workbook()
        ws = wb.active
        ws.title = 'Products'
        ws.append(list(columns))
        for row in rows:
            ws.append([_safe_cell(value) for value in row])
        ws.freeze_panes = 'A2'
        ws.auto_filter.ref = ws.dimensions
        for index, label in enumerate(columns, 1):
            cell = ws.cell(row=1, column=index)
            cell.font = Font(bold=True, color='FFFFFF')
            cell.fill = PatternFill('solid', fgColor='147D64')
            cell.alignment = Alignment(wrap_text=True)
            ws.column_dimensions[get_column_letter(index)].width = (
                32 if label in ('name', 'description', 'category', 'supplier') else 22
            )
            if label in ('sku', 'is_active'):
                for cells in ws.iter_cols(min_col=index, max_col=index, min_row=2):
                    for data_cell in cells:
                        data_cell.number_format = '@'
            if label in ('price', 'cost'):
                for cells in ws.iter_cols(min_col=index, max_col=index, min_row=2):
                    for data_cell in cells:
                        data_cell.number_format = '#,##0.00'
        stream = BytesIO()
        wb.save(stream)
        wb.close()
        payload = stream.getvalue()
        content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    response = HttpResponse(payload, content_type=content_type)
    response['Content-Disposition'] = f'attachment; filename="{filename}.{kind}"'
    response['Cache-Control'] = 'no-store'
    return response


def _read_rows(file):
    suffix = Path(file.name).suffix.lower()
    if suffix not in ('.csv', '.xlsx'):
        raise ValueError('Only .csv and .xlsx files are supported.')
    if file.size == 0 or file.size > MAX_BYTES:
        raise ValueError('The uploaded file must be between 1 byte and 2 MB.')
    if suffix == '.csv':
        try:
            text = file.read().decode('utf-8-sig')
            iterator = csv.reader(StringIO(text, newline=''), strict=True)
            records = []
            for index, row in enumerate(iterator):
                if index > MAX_ROWS + 1:
                    raise ValueError(f'Import limit is {MAX_ROWS} products per file.')
                records.append((index + 1, row))
        except (UnicodeDecodeError, csv.Error) as exc:
            raise ValueError('CSV must be valid UTF-8 with properly quoted values.') from exc
    else:
        from openpyxl import load_workbook
        from openpyxl.utils.exceptions import InvalidFileException
        try:
            file.seek(0)
            with ZipFile(file) as archive:
                info = archive.infolist()
                # Reject very large expanded XML and suspicious compression ratios.
                if len(info) > 200 or sum(member.file_size for member in info) > 12 * 1024 * 1024:
                    raise ValueError('Excel file expands beyond the supported size.')
            file.seek(0)
            book = load_workbook(file, read_only=True, data_only=True)
            try:
                sheet = book.active
                if sheet.max_column and sheet.max_column > 24:
                    raise ValueError('Excel sheet has too many columns.')
                if sheet.max_row and sheet.max_row > MAX_ROWS + 2:
                    raise ValueError(f'Import limit is {MAX_ROWS} products per file.')
                records = []
                for index, row in enumerate(sheet.iter_rows(values_only=True)):
                    if index > MAX_ROWS + 1:
                        raise ValueError(f'Import limit is {MAX_ROWS} products per file.')
                    records.append((index + 1, list(row)))
            finally:
                book.close()
        except (BadZipFile, OSError, KeyError, TypeError, InvalidFileException) as exc:
            raise ValueError('The Excel workbook is invalid or corrupted.') from exc
    if not records:
        raise ValueError('The file is empty; download the import template.')
    header = [str(cell or '').strip().lower().replace(' ', '_') for cell in records[0][1]]
    if any(not value for value in header) or len(set(header)) != len(header):
        raise ValueError('Header columns must be named and unique.')
    if not REQUIRED.issubset(header):
        raise ValueError('Missing required columns: ' + ', '.join(sorted(REQUIRED - set(header))))
    unknown = set(header) - set(IMPORT_COLUMNS)
    if unknown:
        raise ValueError('Unsupported/read-only columns: ' + ', '.join(sorted(unknown)) + '. Use the import template, not the inventory report.')
    parsed = []
    for index, row in records[1:]:
        if not row or not any(value is not None and str(value).strip() for value in row):
            continue
        if len(row) > len(header) and any(value is not None and str(value).strip() for value in row[len(header):]):
            raise ValueError(f'Row {index} contains extra data beyond the headers.')
        parsed.append((index, {key: '' if cell is None else str(cell).strip()
                               for key, cell in zip(header, row)}))
    if not parsed:
        raise ValueError('No product rows found.')
    if len(parsed) > MAX_ROWS:
        raise ValueError(f'Import limit is {MAX_ROWS} products per file.')
    return parsed


def _validate_rows(rows, mode):
    errors = []
    to_save = []
    seen = set()
    categories = {category.name.strip().casefold(): category for category in Category.objects.all()}
    suppliers = {}
    for supplier in Supplier.objects.all():
        suppliers.setdefault(supplier.name.strip().casefold(), []).append(supplier)
    # Existing SKUs are case-insensitive even if the original DB used mixed case.
    current = {}
    for product in Product.objects.all():
        current.setdefault(product.sku.casefold(), []).append(product)
    creates = updates = 0
    for index, row in rows:
        sku = row.get('sku', '').upper().strip()
        issue = None
        if not sku:
            issue = ('sku', 'SKU is required.')
        elif sku.casefold() in seen:
            issue = ('sku', 'Duplicate SKU in the uploaded file.')
        elif len(sku) > 64:
            issue = ('sku', 'SKU cannot exceed 64 characters.')
        seen.add(sku.casefold())
        matches = current.get(sku.casefold(), [])
        instance = matches[0] if len(matches) == 1 else None
        if not issue and len(matches) > 1:
            issue = ('sku', 'Multiple existing records match this SKU.')
        if not issue and matches and mode == 'create':
            issue = ('sku', 'SKU already exists; choose Update existing if intended.')
        category = categories.get(row.get('category', '').casefold())
        if not issue and not category:
            issue = ('category', 'Category not found. Create it before importing.')
        supplier_value = row.get('supplier', '')
        supplier_matches = suppliers.get(supplier_value.casefold(), []) if supplier_value else []
        if not issue and len(supplier_matches) > 1:
            issue = ('supplier', 'Supplier name is ambiguous; rename duplicates before importing.')
        if not issue and supplier_value and not supplier_matches:
            issue = ('supplier', 'Supplier not found. Create it before importing.')
        if issue:
            errors.append({'row': index, 'sku': sku, 'field': issue[0], 'message': issue[1]})
            continue
        data = {
            'sku': sku, 'name': row.get('name', ''), 'category': category.pk,
            'price': row.get('price', ''),
        }
        if not instance or 'supplier' in row:
            data['supplier'] = supplier_matches[0].pk if supplier_matches else None
        for field in ('description', 'cost', 'low_stock_threshold'):
            if field in row:
                data[field] = row[field]
        if 'is_active' in row and row['is_active']:
            boolean = row['is_active'].casefold()
            if boolean not in ('true', 'false', 'yes', 'no', '1', '0'):
                errors.append({'row': index, 'sku': sku, 'field': 'is_active', 'message': 'Use true/false or yes/no.'})
                continue
            data['is_active'] = boolean in ('true', 'yes', '1')
        serializer = ProductSerializer(instance=instance, data=data, partial=bool(instance))
        if not serializer.is_valid():
            for field, messages in serializer.errors.items():
                errors.append({'row': index, 'sku': sku, 'field': str(field), 'message': '; '.join(map(str, messages))})
            continue
        to_save.append(serializer)
        if instance:
            updates += 1
        else:
            creates += 1
    return to_save, errors, creates, updates


class CatalogBulkQuerySerializer(serializers.Serializer):
    file_format = serializers.ChoiceField(choices=['csv', 'xlsx'], required=False, default='csv')


class CatalogBulkUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    mode = serializers.ChoiceField(choices=['create', 'upsert'], required=False, default='create')
    commit = serializers.BooleanField(required=False, default=False)


class BulkCatalogTemplateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(parameters=[CatalogBulkQuerySerializer], summary='Download an empty CSV/XLSX catalog import template')
    def get(self, request):
        if not _authorized(request):
            return Response({'detail': 'Admin or Manager required.'}, status=403)
        try:
            kind = _format(request)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        return _document(IMPORT_COLUMNS, [], kind, 'smartstock-import-template')


class BulkCatalogExportView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(parameters=[CatalogBulkQuerySerializer], summary='Export product catalog with read-only stock columns')
    def get(self, request):
        if not _authorized(request):
            return Response({'detail': 'Admin or Manager required.'}, status=403)
        try:
            kind = _format(request)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        rows = []
        for product in Product.objects.select_related('category', 'supplier').order_by('sku').iterator():
            rows.append((
                product.sku, product.name, product.category.name,
                product.supplier.name if product.supplier else '', product.description,
                str(product.price), str(product.cost), product.low_stock_threshold,
                'true' if product.is_active else 'false', product.stock, product.stock_status,
            ))
        return _document(EXPORT_COLUMNS, rows, kind, 'smartstock-product-inventory')


class BulkCatalogImportView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(request=CatalogBulkUploadSerializer, responses={200: None},
                   summary='Preview or atomically import CSV/XLSX products')
    def post(self, request):
        if not _authorized(request):
            return Response({'detail': 'Admin or Manager required.'}, status=403)
        upload = CatalogBulkUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        file = upload.validated_data['file']
        mode = upload.validated_data['mode']
        commit = upload.validated_data['commit']
        try:
            rows = _read_rows(file)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        # Always revalidate under the commit transaction; preview never writes.
        try:
            with transaction.atomic():
                if commit:
                    list(Product.objects.select_for_update().values_list('pk', flat=True))
                valid_rows, errors, creates, updates = _validate_rows(rows, mode)
                result = {
                    'valid': not errors, 'committed': False, 'total': len(rows),
                    'created': creates, 'updated': updates, 'error_count': len(errors),
                    'errors': errors[:100],
                }
                if errors:
                    return Response(result, status=400 if commit else 200)
                if commit:
                    for serializer in valid_rows:
                        serializer.save()
                    result['committed'] = True
                return Response(result)
        except IntegrityError:
            return Response({'detail': 'Catalog changed during import. Nothing was saved; retry preview.'}, status=409)
