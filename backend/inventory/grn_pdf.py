"""Render a Goods Received Note (GRN) from an existing immutable purchase receipt.

A GRN confirms quantities received. It is not a vendor tax invoice or proof of payment.
"""
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _safe(value):
    # ReportLab's standard font can't display arbitrary Unicode; XML-escape first.
    return escape(str(value or ''))


def _money(value):
    return f"INR {value:,.2f}"


def build_goods_received_note(po, receipt):
    """Return a PDF as bytes. Neither stock nor purchase records are modified."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=13 * mm, rightMargin=13 * mm,
        topMargin=17 * mm, bottomMargin=17 * mm,
        title=f"Orevon GRN {po.number} #{receipt.pk}",
        author='Orevon',
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle('GRNTitle', parent=styles['Heading1'], fontSize=18, leading=22, textColor=colors.HexColor('#047857'))
    body = ParagraphStyle('GRNBody', parent=styles['Normal'], fontSize=9, leading=13)
    small = ParagraphStyle('GRNSmall', parent=styles['Normal'], fontSize=8, leading=11)
    heading = ParagraphStyle('GRNCol', parent=small, textColor=colors.white)

    def p(value, style=body):
        return Paragraph(_safe(value).replace('\n', '<br/>'), style)

    story = [
        Paragraph('OREVON', title),
        p('GOODS RECEIVED NOTE (GRN) — confirmation of physical stock receipt'),
        Spacer(1, 7 * mm),
        p(f'GRN: GRN-{receipt.pk:05d}'),
        p(f'Purchase order: {po.number}'),
        p(f'Supplier: {po.supplier.name}'),
        p(f'Received at: {timezone.localtime(receipt.created_at).strftime("%d %b %Y, %I:%M %p")}'),
        p(f'Received by: {receipt.received_by.get_username()}'),
        Spacer(1, 5 * mm),
    ]

    lines = list(receipt.stock_movements.select_related('product').all().order_by('pk'))
    items = {item.product_id: item for item in po.items.all()}
    rows = [[p(x, heading) for x in ('Product', 'SKU', 'Received', 'Before', 'After', 'PO unit cost', 'Value')]]
    total_qty = 0
    total_value = Decimal('0.00')
    for movement in lines:
        item = items.get(movement.product_id)
        cost = item.unit_cost if item else Decimal('0.00')
        value = cost * movement.quantity
        total_value += value
        total_qty += movement.quantity
        rows.append([
            p(movement.product.name, small), p(movement.product_sku or movement.product.sku, small),
            str(movement.quantity),
            str(movement.stock_before) if movement.stock_before is not None else 'N/A',
            str(movement.stock_after) if movement.stock_after is not None else 'N/A',
            _money(cost), _money(value),
        ])
    if not lines:
        # Defensive fallback: a receipt without stock movements is not a valid GRN.
        raise ValueError('This receipt has no stock movements to document.')

    table = Table(rows, colWidths=[48*mm, 24*mm, 17*mm, 17*mm, 17*mm, 30*mm, 31*mm], repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#047857')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f1f5f9')]),
        ('GRID', (0, 0), (-1, -1), .2, colors.HexColor('#cbd5e1')),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    story.extend([
        table,
        Spacer(1, 5 * mm),
        p(f'Total units received: {total_qty}'),
        p(f'Indicative value at PO unit cost: {_money(total_value)}'),
        Spacer(1, 4 * mm),
        p(f'Delivery note: {receipt.note}' if receipt.note else 'Delivery note: —'),
        Spacer(1, 8 * mm),
        p('This document records goods received into inventory. It is not a tax invoice, payment receipt, or proof of supplier payment.', small),
    ])
    doc.build(story)
    return buffer.getvalue()
