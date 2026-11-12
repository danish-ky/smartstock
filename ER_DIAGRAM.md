# SmartStock Entity–Relationship Diagram

```mermaid
erDiagram
    USER ||--o{ ORDER : "places"
    USER ||--o{ STOCK_MOVEMENT : "performs"
    CATEGORY ||--o{ PRODUCT : "classifies"
    SUPPLIER o|--o{ PRODUCT : "supplies"
    CUSTOMER ||--o{ ORDER : "receives"
    ORDER ||--|{ ORDER_ITEM : "contains"
    PRODUCT ||--o{ ORDER_ITEM : "appears in"
    PRODUCT ||--o{ STOCK_MOVEMENT : "is audited by"
    ORDER o|--o{ STOCK_MOVEMENT : "triggers"

    USER {
      bigint id PK
      string username UK
      string email UK
      string password_hash
      string role "admin / manager / staff / user"
      boolean is_active
    }
    CATEGORY {
      bigint id PK
      string name UK
      string description
    }
    SUPPLIER {
      bigint id PK
      string name
      string email
      string phone
      string address
    }
    PRODUCT {
      bigint id PK
      string name
      string sku UK
      bigint category_id FK
      bigint supplier_id FK "optional"
      decimal price
      decimal cost
      int stock
      int low_stock_threshold
      boolean is_active
    }
    CUSTOMER {
      bigint id PK
      string name
      string email
      string phone
      string address
    }
    ORDER {
      bigint id PK
      string number UK
      bigint customer_id FK
      bigint created_by_id FK
      string status "placed / fulfilled / cancelled"
      decimal total
      datetime created_at
    }
    ORDER_ITEM {
      bigint id PK
      bigint order_id FK
      bigint product_id FK
      int quantity
      decimal unit_price
    }
    STOCK_MOVEMENT {
      bigint id PK
      bigint product_id FK
      bigint order_id FK "optional"
      bigint performed_by_id FK
      string movement_type "in / out / sale / return"
      int quantity
      string note
      datetime created_at
    }
```

## Invariants and constraints

- `Product.sku` and `Category.name` unique.
- One `(order_id, product_id)` pair per order item (unique constraint).
- Product prices and costs nonnegative; quantities positive and stock nonnegative.
- `Category` and historical product/order references use restrictive deletes so business history cannot be accidentally erased.
- Product archive uses `is_active=false`, preserving historical order items.
- Stock changes are recorded by a linked audit movement inside the same transaction.
- Order creation locks product rows in ID order and atomically deducts inventory; a cancellation atomically restores inventory only once.
- Roles are stored in a custom Django `accounts.User` model.

**Development:** SQLite. **Production:** PostgreSQL recommended; migrations create indexes, foreign keys and integrity constraints.
