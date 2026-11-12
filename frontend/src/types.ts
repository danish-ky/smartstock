export type Role = 'admin' | 'manager' | 'staff' | 'user';
export interface User { id: number; username: string; name?: string; first_name: string; last_name: string; email: string; role: Role; is_active?: boolean; date_joined?: string; }
export interface Category { id: number; name: string; description: string; }
export interface Supplier { id: number; name: string; email: string; phone: string; address: string; }
export interface Product { image_url?: string | null; id: number; name: string; sku: string; description: string; category: number; category_name: string; supplier: number | null; supplier_name: string; price: string; cost: string; stock: number; low_stock_threshold: number; stock_status: 'healthy'|'low'|'out'; is_active: boolean; created_at: string; }
export interface Customer { id: number; name: string; email: string; phone: string; address: string; total_orders: number; created_at: string; }
export interface OrderItem { id: number; product: number; product_name: string; sku: string; quantity: number; unit_price: string; subtotal: string; }
export interface Order { paid_amount: string; payment_status: 'unpaid'|'partial'|'paid'; id: number; number: string; customer: number; customer_name: string; status: 'placed'|'fulfilled'|'cancelled'; total: string; notes: string; items: OrderItem[]; created_by_name: string; created_at: string; }
export interface Movement { id: number; product: number; product_name: string; movement_type: 'in'|'out'|'sale'|'return'; quantity: number; note: string; order: number | null; performed_by_name: string; created_at: string; }
export interface Trend { date: string; sales: string|number; orders: number; }
export interface Dashboard { total_products: number; total_customers: number; stock_units: number; low_stock_count: number; total_orders: number; total_sales: string; stock_value: string; sales_trend: Trend[]; recent_orders: Order[]; low_stock_products: Product[]; }
export interface Report { start: string; end: string; sales: string; orders: number; average_order_value: string; stock_value: string; sales_trend: {day:string;sales:string;orders:number}[]; top_products: {product__name:string;product__sku:string;units:number;revenue:string}[]; category_stock: {category__name:string;units:number;product_count:number}[]; low_stock_count:number; }
export interface Page<T> { count: number; next: string | null; previous: string | null; results: T[]; }
