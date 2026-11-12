from rest_framework import generics, status, viewsets, serializers
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from .serializers import MeSerializer, UserSerializer

class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and (request.user.is_superuser or request.user.role == 'admin')

class MeView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MeSerializer
    def get_object(self):
        return self.request.user

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=inline_serializer(
            name='SmartStockLogoutRequest',
            fields={'refresh': serializers.CharField()},
        ),
        responses={205: None},
        summary='Blacklist a refresh token and log out',
    )
    def post(self, request):
        token = request.data.get('refresh')
        if not token:
            return Response({'refresh': ['Refresh token required.']}, status=status.HTTP_400_BAD_REQUEST)
        try:
            RefreshToken(token).blacklist()
        except Exception:
            return Response({'detail': 'Invalid refresh token.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_205_RESET_CONTENT)

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.order_by('-date_joined')
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('You cannot delete your own account.')
        from django.db.models.deletion import ProtectedError
        from rest_framework.exceptions import ValidationError
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError('Account is linked to order or stock history. Disable it instead.')

    def perform_update(self, serializer):
        if serializer.instance.pk == self.request.user.pk:
            role = serializer.validated_data.get('role')
            active = serializer.validated_data.get('is_active')
            if role is not None and role != 'admin' or active is False:
                from rest_framework.exceptions import ValidationError
                raise ValidationError('You cannot revoke your own admin access.')
        serializer.save()
