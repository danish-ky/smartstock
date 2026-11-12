from inventory.billing import (ManualPaymentView, OrderInvoiceView, RazorpayStartView,
                               RazorpayVerifyView, RazorpayWebhookView)
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from accounts.views import MeView, LogoutView, UserViewSet
from inventory.views import (
    CategoryViewSet, ProductViewSet, SupplierViewSet, CustomerViewSet,
    OrderViewSet, StockMovementViewSet, StockAdjustView, DashboardView, ReportsView, HealthView,
    MyOrderListView, MyOrderDetailView,
)

router = DefaultRouter()
router.register('categories', CategoryViewSet)
router.register('products', ProductViewSet, basename='products')
router.register('suppliers', SupplierViewSet)
router.register('customers', CustomerViewSet, basename='customers')
router.register('orders', OrderViewSet)
router.register('movements', StockMovementViewSet, basename='movements')
router.register('users', UserViewSet, basename='users')
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout/', LogoutView.as_view(), name='token_logout'),
    path('api/auth/me/', MeView.as_view(), name='me'),
    path('api/dashboard/', DashboardView.as_view(), name='dashboard'),
    path('api/my/orders/', MyOrderListView.as_view(), name='my-orders'),
    path('api/my/orders/<int:pk>/', MyOrderDetailView.as_view(), name='my-order-detail'),
    path('api/reports/', ReportsView.as_view(), name='reports'),
    path('api/inventory/adjust/', StockAdjustView.as_view(), name='adjust-stock'),
    path('api/health/', HealthView.as_view(), name='health'),
    path('api/orders/<int:order_id>/payments/', ManualPaymentView.as_view(), name='order-payments'),
    path('api/orders/<int:order_id>/invoice/', OrderInvoiceView.as_view(), name='order-invoice'),
    path('api/orders/<int:order_id>/razorpay/start/', RazorpayStartView.as_view(), name='razorpay-start'),
    path('api/orders/<int:order_id>/razorpay/verify/', RazorpayVerifyView.as_view(), name='razorpay-verify'),
    path('api/razorpay/webhook/', RazorpayWebhookView.as_view(), name='razorpay-webhook'),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/', include(router.urls)),
]

# Serve uploaded product images only during local development.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
