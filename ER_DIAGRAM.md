# Orevon - Entity-Relationship Diagram

This diagram documents the Django ORM models in `backend/accounts/models.py` and `backend/inventory/models.py` as reviewed on November 15, 2026. It covers the shared database used by the Orevon web application and Android APK.

```mermaid
erDiagram
    USER ||--o{ ORDER : "creates"
    USER ||--o{ PURCHASE_ORDER : "creates"
    USER ||--o{ PURCHASE_RECEIPT : "receives"
    USER ||--o{ STOCK_MOVEMENT : "performs"
    USER o|--o{ PAYMENT : "records"
    USER o|--o| CUSTOMER : "linked account"

    CATEGORY ||--o{ PRODUCT : "classifies"
    SUPPLIER o|--o{ PRODUCT : "supplies"
    SUPPLIER ||--o{ PURCHASE_ORDER : "receives orders"
    CUSTOMER ||--o{ ORDER : "places"

    ORDER ||--o{ ORDER_ITEM : "contains"
    ORDER ||--o{ PAYMENT : "has receipts"
    ORDER ||--o{ RAZORPAY_ATTEMPT : "has gateway attempts"
    ORDER o|--o{ STOCK_MOVEMENT : "triggers"

    PRODUCT ||--o{ ORDER_ITEM : "sold as"
    PRODUCT ||--o{ PURCHASE_ORDER_ITEM : "purchased as"
    PRODUCT ||--o{ STOCK_MOVEMENT : "is audited by"

    PURCHASE_ORDER ||--o{ PURCHASE_ORDER_ITEM : "contains"
    PURCHASE_ORDER ||--o{ PURCHASE_RECEIPT : "has receipts"
    PURCHASE_ORDER o|--o{ STOCK_MOVEMENT : "triggers"
    PURCHASE_RECEIPT o|--o{ STOCK_MOVEMENT : "documents"

    USER {
        bigint id PK
        string username UK
        string email UK
        string password "hashed value"
        string role "admin / manager / staff / user"
        boolean is_active
    }
    CATEGORY {
        bigint id PK
        string name UK
        string description
        datetime created_at
    }
    SUPPLIER {
        bigint id PK
        string name
        string email
        string phone
        string address
        datetime created_at
    }
    PRODUCT {
        bigint id PK
        string name
        string sku UK
        string description
        string image "optional"
        bigint category_id FK
        bigint supplier_id FK "optional"
        decimal price
        decimal cost
        int stock
        int low_stock_threshold
        boolean is_active
        datetime created_at
        datetime updated_at
    }
    CUSTOMER {
        bigint id PK
        bigint user_id FK "optional and unique"
        string name
        string email
        string phone
        string address
        datetime created_at
    }
    ORDER {
        bigint id PK
        string number UK "nullable"
        bigint customer_id FK
        bigint created_by_id FK
        string status "placed / fulfilled / cancelled"
        decimal total
        string notes
        datetime created_at
        datetime updated_at
    }
    ORDER_ITEM {
        bigint id PK
        bigint order_id FK
        bigint product_id FK
        int quantity
        decimal unit_price
    }
    PURCHASE_ORDER {
        bigint id PK
        string number UK "nullable"
        bigint supplier_id FK
        bigint created_by_id FK
        string status "draft / ordered / partial / received / cancelled"
        string notes
        datetime ordered_at "optional"
        datetime created_at
        datetime updated_at
    }
    PURCHASE_ORDER_ITEM {
        bigint id PK
        bigint purchase_order_id FK
        bigint product_id FK
        int quantity
        int received_quantity
        decimal unit_cost
    }
    PURCHASE_RECEIPT {
        bigint id PK
        bigint purchase_order_id FK
        bigint received_by_id FK
        string note
        datetime created_at
    }
    STOCK_MOVEMENT {
        bigint id PK
        bigint product_id FK
        bigint order_id FK "optional"
        bigint purchase_order_id FK "optional"
        bigint purchase_receipt_id FK "optional"
        bigint performed_by_id FK
        string movement_type "in / out / sale / return"
        int quantity
        int stock_before "optional snapshot"
        int stock_after "optional snapshot"
        string product_sku "snapshot"
        string note
        datetime created_at
    }
    PAYMENT {
        bigint id PK
        bigint order_id FK
        bigint recorded_by_id FK "optional"
        decimal amount
        string method "cash / upi / card / bank / razorpay"
        string reference
        string gateway_payment_id UK "optional"
        datetime created_at
    }
    RAZORPAY_ATTEMPT {
        bigint id PK
        bigint order_id FK
        string gateway_order_id UK
        bigint amount_paise
        string status "created / paid"
        datetime created_at
    }
```

## Relationships and business rules

- **Users and roles:** The custom Django `accounts.User` model supports Admin, Manager, Staff, and User roles. Staff/admin accounts can be associated with created orders, stock movements, purchase orders, and purchase receipts.
- **Customer accounts:** A customer record can exist without a login. Its optional `user` relationship is one-to-one, and model validation requires a linked account to have the `user` role.
- **Product catalog:** Each product belongs to a category and may optionally have a supplier. SKU and category name are unique. Products can be archived using `is_active`.
- **Sales:** A sales order belongs to a customer and an account that created it. An order can have multiple order items, payments, gateway attempts, and linked inventory movements. Each `(order, product)` pair is unique among order items.
- **Purchasing:** A purchase order belongs to a supplier and a creator. It has line items and may have several receiving events. Each `(purchase_order, product)` pair is unique among purchase order items. Item-level database checks enforce ordered quantity >= 1 and received quantity <= ordered quantity.
- **Inventory audit:** Stock movements reference a product and the user performing the movement. They can optionally reference a sales order, purchase order, or purchase receipt. Stock balance snapshots and the SKU snapshot are retained when available.
- **Payments:** Payment records belong to a sales order and optionally identify the recording user. `gateway_payment_id` is unique when supplied. Razorpay gateway attempts are tracked separately from confirmed payments.
- **Validation:** Prices, costs, amounts, and quantities have model validators and positive-integer field types where defined. Do not assume every model validator is also a database-level `CHECK` constraint.

## Database environments

- **Local development:** SQLite is available when `DATABASE_URL` is not set.
- **Hosted deployment:** PostgreSQL on Render is used by the deployed Django API; the React web and Expo Android apps access it through that same API.

The diagram represents declared Django model relationships; it does not by itself establish that every workflow or permission has been integration-tested.
