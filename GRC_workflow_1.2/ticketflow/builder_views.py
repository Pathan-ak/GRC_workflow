# ticketflow/builder_views.py
import json

from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views import View
from django.views.generic import TemplateView

from .builder_api import save_form_structure, serialize_form_structure
from .models import Form


class StaffRequiredMixin(UserPassesTestMixin):
    def test_func(self):
        u = self.request.user
        return bool(u and u.is_authenticated and u.is_staff)


class FormBuilderView(LoginRequiredMixin, StaffRequiredMixin, TemplateView):
    template_name = "ticketflow/form_builder.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        form = get_object_or_404(Form, pk=self.kwargs["pk"])
        ctx["form_obj"] = form
        ctx["initial_structure"] = serialize_form_structure(form)
        return ctx


class FormStructureApiView(LoginRequiredMixin, StaffRequiredMixin, View):
    def get(self, request, pk):
        form = get_object_or_404(Form, pk=pk)
        return JsonResponse(serialize_form_structure(form))

    def post(self, request, pk):
        form = get_object_or_404(Form, pk=pk)
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            return JsonResponse({"ok": False, "error": "Invalid JSON"}, status=400)
        try:
            result = save_form_structure(form, payload)
        except Exception as e:
            return JsonResponse({"ok": False, "error": str(e)}, status=400)
        return JsonResponse(result)
