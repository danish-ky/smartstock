"""Atomic, audited inventory operations; never mutate product.stock from serializers."""
from decimal import Decimal
from django.db import transaction
from rest_framework.exceptions import ValidationError
from .models import Product, Order, OrderItem, StockMovement

@transaction.atomic
def adjust_stock(*, product_id, movement_type, quantity, actor, note=''):
    if movement_type not in ('in', 'out') or not isinstance(quantity, int) or quantity <= 0:
        raise ValidationError('Invalid stock adjustment.')
    product = Product.objects.select_for_update().get(pk=product_id, is_active=True)
    if movement_type == 'out' and product.stock < quantity:
        raise ValidationError({'quantity': f'Insufficient stock: {product.stock} available.'})
    product.stock = product.stock + quantity if movement_type == 'in' else product.stock - quantity
    product.save(update_fields=['stock', 'updated_at'])
    movement = StockMovement.objects.create(product=product, movement_type=movement_type, quantity=quantity,
                                            note=note, performed_by=actor)
    return movement

@transaction.atomic
def place_order(*, customer, lines, actor, notes=''):
    products_by_id = {}
    for product in Product.objects.select_for_update().filter(pk__in=[r['product'].pk for r in lines]).order_by('pk'):
        products_by_id[product.pk] = product
    for line in lines:
        product = products_by_id.get(line['product'].pk)
        if not product or not product.is_active:
            raise ValidationError('One or more products are no longer available.')
        if product.stock < line['quantity']:
            raise ValidationError({'items': f'{product.name}: only {product.stock} units available.'})
    order = Order.objects.create(customer=customer, notes=notes, created_by=actor)
    order.number = f'SO-{order.pk:05d}'
    total = Decimal('0.00')
    for line in lines:
        product = products_by_id[line['product'].pk]
        qty = line['quantity']
        price = product.price
        OrderItem.objects.create(order=order, product=product, quantity=qty, unit_price=price)
        product.stock -= qty
        product.save(update_fields=['stock', 'updated_at'])
        StockMovement.objects.create(product=product, movement_type='sale', quantity=qty,
                                      order=order, performed_by=actor, note=f'Order {order.number}')
        total += price * qty
    order.total = total
    order.save(update_fields=['number', 'total', 'updated_at'])
    return order

@transaction.atomic
def change_order_status(*, order_id, status, actor):
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.status == Order.Status.CANCELLED:
        raise ValidationError('A cancelled order cannot be changed.')
    if status == 'fulfilled':
        if order.status != Order.Status.PLACED:
            raise ValidationError('Only placed orders can be fulfilled.')
        order.status = Order.Status.FULFILLED
    elif status == 'cancelled':
        if order.status != Order.Status.PLACED:
            raise ValidationError('Only placed orders can be cancelled.')
        # A financial refund is NOT the same as restoring stock.
        # Do not silently cancel paid orders or unresolved gateway checkouts.
        if order.payments.exists() or order.gateway_attempts.exists():
            raise ValidationError('Resolve/refund recorded or pending payments before cancelling this order.')
        for item in order.items.select_related('product').order_by('product_id'):
            product = Product.objects.select_for_update().get(pk=item.product_id)
            product.stock += item.quantity
            product.save(update_fields=['stock', 'updated_at'])
            StockMovement.objects.create(product=product, movement_type='return', quantity=item.quantity,
                                          order=order, performed_by=actor, note=f'Cancelled {order.number}')
        order.status = Order.Status.CANCELLED
    else:
        raise ValidationError('Unsupported order status.')
    order.save(update_fields=['status', 'updated_at'])
    return order
