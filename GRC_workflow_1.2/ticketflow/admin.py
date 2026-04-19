# ticketflow/admin.py
from django import forms
from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html

from .models import Form, FormField, FormEntry, FormEntryValue, TicketProcess, FormSection, FormTab
try:
    from .dynamic_models import WorkflowTemplate, WorkflowStage
except Exception:  # pragma: no cover
    WorkflowTemplate = WorkflowStage = None


class FormTabInline(admin.TabularInline):
    model = FormTab
    extra = 1
    ordering = ("order", "id")
    fields = ("name", "description", "order", "icon")  # Removed drag_tab - will inject via JS
    # readonly_fields = ("drag_tab",)  # Removed - using JS injection instead
    
    class Media:
        css = {
            "all": (
                "ticketflow/admin-alignment-fix.css",
                "ticketflow/admin-drag-drop.css",
            )
        }
        js = (
            "ticketflow/admin-drag-drop.js",
        )


class FormSectionInline(admin.TabularInline):
    model = FormSection
    extra = 1
    ordering = ("tab__order", "tab__id", "order", "id")
    fields = ("tab", "name", "description", "order", "is_collapsible", "columns")  # Removed drag_section - will inject via JS
    # readonly_fields = ("drag_section",)  # Removed - using JS injection instead
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "tab":
            # Filter tabs to only show tabs for the current form
            if hasattr(request, 'resolver_match') and request.resolver_match:
                form_id = request.resolver_match.kwargs.get('object_id')
                if form_id:
                    kwargs["queryset"] = FormTab.objects.filter(form_id=form_id)
                else:
                    kwargs["queryset"] = FormTab.objects.none()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)
    
    class Media:
        css = {
            "all": (
                "ticketflow/admin-alignment-fix.css",
                "ticketflow/admin-drag-drop.css",
            )
        }
        js = (
            "ticketflow/admin-drag-drop.js",
        )


class FormFieldInline(admin.TabularInline):
    """
    Tabular inline with a drag handle. We KEEP the 'order' form field but hide
    its widget so our JS can update it on drag and Django will persist it.
    """
    model = FormField
    extra = 0
    ordering = ("tab__order", "tab__id", "section__order", "section__id", "order", "id")

    # Don't show 'order' visibly, but DO keep it in the form
    fields = (
        "drag",
        "tab",  # NEW: Tab dropdown (for fields without section)
        "section",  # Section dropdown
        "label", "field_type", "required", "help_text", "choices",
        "max_length", "role", "placeholder",
        "column",  # Column number
        "readonly", "hidden",
        "order",  # keep in the form; we will hide with a HiddenInput
    )
    readonly_fields = ("drag",)

    def drag(self, obj):
        # Always return the drag handle
        # For new forms, obj might be None or a new unsaved instance
        return format_html('<span class="drag-handle" title="Drag to reorder">⋮⋮</span>')
    drag.short_description = "Drag"

    def formfield_for_dbfield(self, db_field, request, **kwargs):
        formfield = super().formfield_for_dbfield(db_field, request, **kwargs)
        if db_field.name == "order":
            formfield.widget = forms.HiddenInput()   # <-- keep in POST, hide in UI
        return formfield
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "section":
            # Filter sections to only show sections for the current form
            if hasattr(request, 'resolver_match') and request.resolver_match:
                form_id = request.resolver_match.kwargs.get('object_id')
                if form_id:
                    kwargs["queryset"] = FormSection.objects.filter(form_id=form_id)
                else:
                    kwargs["queryset"] = FormSection.objects.none()
        elif db_field.name == "tab":
            # Filter tabs to only show tabs for the current form
            if hasattr(request, 'resolver_match') and request.resolver_match:
                form_id = request.resolver_match.kwargs.get('object_id')
                if form_id:
                    kwargs["queryset"] = FormTab.objects.filter(form_id=form_id)
                else:
                    kwargs["queryset"] = FormTab.objects.none()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    class Media:
        # We still declare Media for classic admin;
        # new admin may ignore it, so we will also inject via base_site.html below.
        css = {
            "all": (
                "ticketflow/admin-field-sizes.css",
                "ticketflow/admin-inline-compact.v2.css",
                "ticketflow/admin-sortable-inline.css",
                "ticketflow/admin-sections.css",
                "ticketflow/admin-alignment-fix.css",  # NEW - Load last to override
                "ticketflow/admin-drag-drop.css",
            )
        }
        js = (
            "ticketflow/admin-inline-mark.js",
            "ticketflow/admin-sections.js",  # Combined drag-and-drop with sections
            "ticketflow/admin-alignment-fix.js",  # NEW - Alignment fixes
            "ticketflow/admin-drag-drop.js",  # Unified drag-and-drop for all inlines
        )


@admin.register(Form)
class FormAdmin(admin.ModelAdmin):
    list_display = ("name", "workflow_template", "created")
    search_fields = ("name",)
    list_filter = ("workflow_template",)
    readonly_fields = ("builder_link",)
    fieldsets = (
        (None, {"fields": ("name", "workflow_template")}),
        ("Notifications", {"fields": ("notify_emails",)}),
        (
            "Visual form builder",
            {
                "fields": ("builder_link",),
                "description": "Design tabs, sections, and fields with drag-and-drop. Requires staff login.",
            },
        ),
    )

    def builder_link(self, obj):
        if not obj or not obj.pk:
            return format_html(
                "<span>Save the form first, then open the visual builder.</span>"
            )
        url = reverse("grc:form_builder", kwargs={"pk": obj.pk})
        return format_html(
            '<a href="{}" target="_blank" rel="noopener" class="button" '
            'style="padding:10px 14px;background:#417690;color:#fff;border-radius:6px;'
            'text-decoration:none;font-weight:600;">Open visual form builder</a>',
            url,
        )

    builder_link.short_description = "Builder"
    inlines = [FormTabInline, FormSectionInline, FormFieldInline]  # Tabs, then sections, then fields
    change_form_template = "admin/ticketflow/form/change_form.html"  # Explicitly set template
    
    class Media:
        # Ensure drag-and-drop script is always loaded for Form admin
        js = (
            "ticketflow/admin-drag-drop.js",
        )
        css = {
            "all": (
                "ticketflow/admin-drag-drop.css",
            )
        }


@admin.register(FormEntry)
class FormEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "form", "submitted_by", "submitted_at")
    list_filter = ("form",)
    search_fields = ("id", "form__name", "submitted_by__username")


@admin.register(FormEntryValue)
class FormEntryValueAdmin(admin.ModelAdmin):
    list_display = ("entry", "field", "value_text", "value_file")
    search_fields = ("entry__id", "field__label", "value_text")


@admin.register(TicketProcess)
class TicketProcessAdmin(admin.ModelAdmin):
    list_display = ("id", "form", "workflow_template", "created", "finished")
    list_filter = ("form", "workflow_template")
    search_fields = ("id", "form__name")


if WorkflowTemplate and WorkflowStage:
    class WorkflowStageInline(admin.TabularInline):
        model = WorkflowStage
        extra = 0
        ordering = ("order", "id")

    @admin.register(WorkflowTemplate)
    class WorkflowTemplateAdmin(admin.ModelAdmin):
        list_display = ("name", "updated", "created")
        search_fields = ("name",)
        inlines = [WorkflowStageInline]