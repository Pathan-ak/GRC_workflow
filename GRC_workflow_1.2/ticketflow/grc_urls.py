from django.urls import path

from .builder_views import FormBuilderView, FormStructureApiView
from .views import FormListView, StartFromTemplateView

app_name = "grc"

urlpatterns = [
    path("", FormListView.as_view(), name="form_list"),
    path("form/<int:pk>/start/", StartFromTemplateView.as_view(), name="form_start"),
    path("forms/<int:pk>/builder/", FormBuilderView.as_view(), name="form_builder"),
    path("api/forms/<int:pk>/structure/", FormStructureApiView.as_view(), name="api_form_structure"),
]
