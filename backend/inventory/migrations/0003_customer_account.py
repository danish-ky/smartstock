from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('inventory', '0002_payments'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='user',
            field=models.OneToOneField(
                to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL,
                related_name='customer_profile', limit_choices_to={'role': 'user'},
                null=True, blank=True,
            ),
        ),
    ]
