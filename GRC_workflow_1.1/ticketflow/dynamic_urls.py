from django.urls import path
from .views import FormListView, StartFromTemplateView

app_name = "grc"  # namespace used by the Viewflow tile

urlpatterns = [
    path("", FormListView.as_view(), name="form_list"),
    path("start/<int:pk>/", StartFromTemplateView.as_view(), name="form_start"),
]