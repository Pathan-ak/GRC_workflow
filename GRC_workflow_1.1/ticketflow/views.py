from django import forms
from django.views.generic import ListView, RedirectView
from viewflow.workflow.flow.views import CreateProcessView, UpdateProcessView

from .models import (
    TicketProcess,
    Form as FormModel,
    FormEntry,
    FormEntryValue,
    FormField,
)
from .forms import add_fields_to_form, ApprovalForm


ROLE_DISPLAY = {
    "user": "Risk Representative",
    "dev": "Risk Champion",
    "ba": "Risk Approver",
    "pm": "CRO",
}


# REQUIRED BY viewflow
def send_submission_emails(process: TicketProcess):
    return


def _snapshot_from_entry(entry: FormEntry) -> dict:
    data = {}
    for v in entry.values.select_related("field"):
        data[v.field.label] = (
            v.value_text or (v.value_file.name if v.value_file else "")
        )
    return data


# -----------------------------
# NORMAL FIELD SAVE
# -----------------------------
def _update_entry_values_for_role(entry, form_obj, cleaned_data, files, role=None):
    fields = form_obj.fields.all()
    if role is None:
        # When role is None, filter to only ROLE_USER fields (for start form)
        fields = fields.filter(role=FormField.ROLE_USER)
    else:
        # When role is provided, filter to that specific role
        fields = fields.filter(role=role)

    for ff in fields:
        key = str(ff.id)
        obj, _ = FormEntryValue.objects.get_or_create(entry=entry, field=ff)

        if ff.field_type == FormField.FILE:
            file = files.get(key)
            if file:
                obj.value_file = file
                obj.value_text = ""
        else:
            if key in cleaned_data:
                obj.value_text = str(cleaned_data.get(key, ""))

        obj.save()


# -----------------------------
# 🔥 CALCULATED FIELD SAVE (TYPO SAFE)
# -----------------------------
def _save_calculated_fields(entry, form_obj, post_data):
    value_map = {
        "inherent": post_data.get("inherent_risk_level"),
        "residual": post_data.get("residual_risk_level"),
        "control": post_data.get("overall_control_effectiveness"),
    }

    for field in form_obj.fields.all():
        label = field.label.lower()
        for key, value in value_map.items():
            if value and key in label:
                obj, _ = FormEntryValue.objects.get_or_create(
                    entry=entry,
                    field=field,
                )
                obj.value_text = value
                obj.save()


# -----------------------------
# 🎨 COLOR HELPER FOR SUMMARY
# -----------------------------
def _risk_css_class(field_label: str, value: str) -> str:
    label = field_label.lower()
    val = (value or "").lower()

    # Inherent Risk
    if "inherent" in label:
        return {
            "critical": "risk-critical",
            "high": "risk-high",
            "medium": "risk-medium",
            "low": "risk-low",
        }.get(val, "")

    # Residual Risk (%)
    if "residual" in label:
        try:
            pct = int(val.replace("%", "").strip())
            if pct >= 75:
                return "risk-critical"
            if pct >= 50:
                return "risk-high"
            if pct >= 25:
                return "risk-medium"
            return "risk-low"
        except Exception:
            return ""

    # Control Effectiveness
    if "control" in label:
        return {
            "weak": "risk-critical",
            "moderate": "risk-high",
            "good": "risk-medium",
            "strong": "risk-low",
        }.get(val, "")

    return ""


# -----------------------------
# ✅ SUMMARY TABLE (WITH COLORS)
# -----------------------------
def build_ticket_summary_html(process: TicketProcess) -> str:
    if not process.entry:
        return "<em>No data yet</em>"

    rows = []

    for field in process.form.fields.all().order_by("order"):
        try:
            val = process.entry.values.get(field=field)
            value = val.value_text or (
                val.value_file.name if val.value_file else ""
            )
        except FormEntryValue.DoesNotExist:
            value = ""

        css = _risk_css_class(field.label, value)
        td = f"<td class='{css}'>{value}</td>" if css else f"<td>{value}</td>"

        rows.append(f"<tr><th>{field.label}</th>{td}</tr>")

    return "<table class='decision-table'>" + "".join(rows) + "</table>"


# -----------------------------
# START VIEW
# -----------------------------
class DynamicStartView(CreateProcessView):
    model = TicketProcess

    def get_form_class(self):
        selected_form_id = self.request.POST.get("form") or self.request.GET.get("form")

        class StartForm(forms.ModelForm):
            class Meta:
                model = TicketProcess
                fields = ["form"]

            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                # Set initial value for form field if form_id is in GET/POST
                if selected_form_id:
                    try:
                        # Set the form field value to the selected form
                        self.fields['form'].initial = selected_form_id
                        # Also set it on the form instance if this is a POST with data
                        if self.data and 'form' not in self.data:
                            # If form is missing from POST, add it
                            self.data = self.data.copy()
                            self.data['form'] = selected_form_id
                        
                        form_obj = FormModel.objects.get(pk=selected_form_id)
                        add_fields_to_form(self, form_obj, role=None)
                    except (FormModel.DoesNotExist, ValueError):
                        pass

        return StartForm
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        selected_form_id = self.request.POST.get("form") or self.request.GET.get("form")
        if selected_form_id:
            try:
                context['form_obj'] = FormModel.objects.get(pk=selected_form_id)
            except FormModel.DoesNotExist:
                context['form_obj'] = None
        return context
    
    def form_invalid(self, form):
        """Handle form validation errors"""
        print("DEBUG: Form validation failed!")
        print("DEBUG: Form errors:", form.errors)
        print("DEBUG: Form non_field_errors:", form.non_field_errors())
        print("DEBUG: POST data keys:", list(self.request.POST.keys()))
        print("DEBUG: POST form value:", self.request.POST.get("form"))
        
        # Print each field's errors
        for field_name, errors in form.errors.items():
            print(f"DEBUG: Field '{field_name}' errors: {errors}")
        
        return super().form_invalid(form)
    
    def post(self, request, *args, **kwargs):
        """Override post to add debugging"""
        print("DEBUG: POST request received")
        print("DEBUG: POST data:", dict(request.POST))
        print("DEBUG: FILES data:", dict(request.FILES))
        return super().post(request, *args, **kwargs)

    def form_valid(self, form):
        # Debug: Print cleaned_data to see what's being submitted
        print("DEBUG: Form is valid!")
        print("DEBUG: cleaned_data keys:", list(form.cleaned_data.keys()))
        print("DEBUG: POST data keys:", list(self.request.POST.keys()))
        
        # Get the form object - try multiple ways
        selected_form_id = None
        form_field_value = form.cleaned_data.get("form")
        
        if form_field_value:
            # If form field is a model instance, get its ID
            if hasattr(form_field_value, 'id'):
                selected_form_id = str(form_field_value.id)
            else:
                selected_form_id = str(form_field_value)
        
        # Fallback to POST/GET data (important for when form field is missing)
        if not selected_form_id:
            selected_form_id = self.request.POST.get("form") or self.request.GET.get("form")
        
        if not selected_form_id:
            print("DEBUG: No form ID found in cleaned_data, POST, or GET!")
            print("DEBUG: cleaned_data form value:", form.cleaned_data.get("form"))
            print("DEBUG: POST form value:", self.request.POST.get("form"))
            print("DEBUG: GET form value:", self.request.GET.get("form"))
            # Don't add error here - let it fail naturally or use GET param
            # Try to get from GET parameter as last resort
            selected_form_id = self.request.GET.get("form")
        
        if not selected_form_id:
            form.add_error(None, "Please select a form")
            return self.form_invalid(form)
        
        try:
            form_obj = FormModel.objects.get(pk=selected_form_id)
        except (FormModel.DoesNotExist, ValueError, TypeError) as e:
            print(f"DEBUG: Error getting form: {e}, form_id: {selected_form_id}")
            form.add_error(None, "Selected form does not exist")
            return self.form_invalid(form)
        
        print("DEBUG: Form ID:", selected_form_id)
        print("DEBUG: Form object:", form_obj)
        
        # Create the process
        response = super().form_valid(form)
        process = self.object
        
        # Ensure process.form is set
        if not process.form:
            process.form = form_obj
            process.save()

        if not process.entry:
            process.entry = FormEntry.objects.create(
                form=process.form,
                submitted_by=self.request.user,
            )

        try:
            _update_entry_values_for_role(
                process.entry,
                process.form,
                form.cleaned_data,
                self.request.FILES,
                role=None,  # Explicitly pass None to filter ROLE_USER fields
            )

            _save_calculated_fields(
                process.entry,
                process.form,
                self.request.POST,
            )

            process.ticket_data = _snapshot_from_entry(process.entry)
            process.save()
            
            print("DEBUG: Ticket created successfully. Process ID:", process.id)
            print("DEBUG: Entry ID:", process.entry.id)
            print("DEBUG: Entry values count:", process.entry.values.count())
        except Exception as e:
            # Log the error
            import traceback
            print(f"ERROR saving form data: {e}")
            print(traceback.format_exc())
            form.add_error(None, f"Error saving form data: {str(e)}")
            return self.form_invalid(form)

        return response


# -----------------------------
# APPROVAL VIEW
# -----------------------------
class ApprovalView(UpdateProcessView):
    model = TicketProcess
    template_name = "viewflow/workflow/task.html"
    role = None

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        role = self.role or self.kwargs.get("role")

        ctx["ticket_summary_html"] = build_ticket_summary_html(self.object)
        ctx["role_display"] = ROLE_DISPLAY.get(role, role)
        ctx["is_approval"] = True

        ctx["status_row"] = {
            ROLE_DISPLAY["user"]: self.object.user_decision or "pending",
            ROLE_DISPLAY["dev"]: self.object.dev_decision or "pending",
            ROLE_DISPLAY["ba"]: self.object.ba_decision or "pending",
            ROLE_DISPLAY["pm"]: self.object.pm_decision or "pending",
        }
        return ctx

    def get_form_class(self):
        process = self.get_object()
        role = self.role or self.kwargs.get("role")

        class _Form(ApprovalForm):
            class Meta(ApprovalForm.Meta):
                model = TicketProcess
                fields = [f"{role}_comment"]

            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                initial_map = {
                    str(v.field_id): v.value_text
                    for v in process.entry.values.all()
                }
                add_fields_to_form(self, process.form, role=role, initial_map=initial_map)

        return _Form

    def form_valid(self, form):
        process = form.instance
        role = self.role or self.kwargs.get("role")

        decision = self.request.POST.get("decision")
        if decision not in ("approved", "rejected"):
            return self.form_invalid(form)

        _update_entry_values_for_role(
            process.entry,
            process.form,
            form.cleaned_data,
            self.request.FILES,
            role,
        )

        _save_calculated_fields(
            process.entry,
            process.form,
            self.request.POST,
        )

        setattr(process, f"{role}_decision", decision)
        process.ticket_data = _snapshot_from_entry(process.entry)
        process.save()

        return super().form_valid(form)


# -----------------------------
# GRC TILE
# -----------------------------
class FormListView(ListView):
    template_name = "grc/form_list.html"
    context_object_name = "forms"

    def get_queryset(self):
        return FormModel.objects.filter(workflow_template__isnull=False)


class StartFromTemplateView(RedirectView):
    permanent = False

    def get_redirect_url(self, *args, **kwargs):
        return f"/ticketflow/ticket/start/?form={kwargs['pk']}"