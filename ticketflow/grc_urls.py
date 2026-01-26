from django.urls import path
from .views import FormListView, StartFromTemplateView

app_name = "grc"

urlpatterns = [
    path("", FormListView.as_view(), name="form_list"),
    path("form/<int:pk>/start/", StartFromTemplateView.as_view(), name="form_start"),
]
