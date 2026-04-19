# ticketflow/builder_api.py
"""Serialize / deserialize form structure for the visual form builder."""
from __future__ import annotations

from typing import Any

from django.db import transaction

from .models import Form, FormField, FormSection, FormTab


def _serialize_field(f: FormField) -> dict[str, Any]:
    return {
        "id": f.id,
        "label": f.label,
        "field_type": f.field_type,
        "required": f.required,
        "help_text": f.help_text,
        "choices": f.choices,
        "max_length": f.max_length,
        "order": f.order,
        "column": f.column,
        "column_width": f.column_width,
        "role": f.role,
        "placeholder": f.placeholder,
        "default_value": f.default_value,
        "min_value": f.min_value,
        "max_value": f.max_value,
        "regex": f.regex,
        "readonly": f.readonly,
        "hidden": f.hidden,
    }


def _serialize_section(section: FormSection) -> dict[str, Any]:
    fields = [
        _serialize_field(f)
        for f in section.fields.order_by("order", "column", "id")
    ]
    return {
        "id": section.id,
        "name": section.name,
        "description": section.description,
        "order": section.order,
        "is_collapsible": section.is_collapsible,
        "columns": section.columns,
        "fields": fields,
    }


def serialize_form_structure(form: Form) -> dict[str, Any]:
    """Return nested JSON for the builder (tabs → sections → fields)."""
    tabs_qs = list(form.tabs.order_by("order", "id"))
    orphan_sections = list(
        form.sections.filter(tab__isnull=True).order_by("order", "id")
    )

    tabs_out: list[dict[str, Any]] = []
    for idx, tab in enumerate(tabs_qs):
        sections_qs = list(tab.sections.order_by("order", "id"))
        if idx == 0 and orphan_sections:
            sections_qs = sections_qs + orphan_sections
        tabs_out.append(
            {
                "id": tab.id,
                "name": tab.name,
                "description": tab.description,
                "order": tab.order,
                "icon": tab.icon,
                "sections": [_serialize_section(s) for s in sections_qs],
            }
        )

    if not tabs_out and orphan_sections:
        tabs_out.append(
            {
                "id": None,
                "name": "General",
                "description": "",
                "order": 0,
                "icon": "",
                "sections": [_serialize_section(s) for s in orphan_sections],
            }
        )

    return {
        "form": {
            "id": form.id,
            "name": form.name,
            "notify_emails": form.notify_emails,
            "workflow_template_id": form.workflow_template_id,
        },
        "tabs": tabs_out,
    }


@transaction.atomic
def save_form_structure(form: Form, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Replace tabs/sections/fields from builder JSON.
    Deletes tabs (and cascaded sections/fields) not present in payload.
    """
    tabs_in = payload.get("tabs") or []
    if not tabs_in:
        FormTab.objects.filter(form=form).delete()
        return {"ok": True, "form": serialize_form_structure(form)}

    kept_tab_ids: list[int] = []
    for t_order, tab_data in enumerate(tabs_in):
        tid = tab_data.get("id")
        if tid:
            try:
                tab_obj = FormTab.objects.get(pk=tid, form=form)
            except FormTab.DoesNotExist:
                tab_obj = FormTab(form=form)
        else:
            tab_obj = FormTab(form=form)

        tab_obj.name = (tab_data.get("name") or "Tab")[:200]
        tab_obj.description = tab_data.get("description") or ""
        tab_obj.order = t_order
        tab_obj.icon = (tab_data.get("icon") or "")[:50]
        tab_obj.save()
        kept_tab_ids.append(tab_obj.id)

        sections_in = tab_data.get("sections") or []
        kept_section_ids: list[int] = []
        for s_order, sec_data in enumerate(sections_in):
            sid = sec_data.get("id")
            if sid:
                try:
                    sec_obj = FormSection.objects.get(pk=sid, form=form)
                except FormSection.DoesNotExist:
                    sec_obj = FormSection(form=form)
            else:
                sec_obj = FormSection(form=form)

            sec_obj.form = form
            sec_obj.tab = tab_obj
            sec_obj.name = (sec_data.get("name") or "Section")[:200]
            sec_obj.description = sec_data.get("description") or ""
            sec_obj.order = s_order
            sec_obj.is_collapsible = bool(sec_data.get("is_collapsible"))
            cols = int(sec_data.get("columns") or 1)
            sec_obj.columns = max(1, min(4, cols))
            sec_obj.save()
            kept_section_ids.append(sec_obj.id)

            fields_in = sec_data.get("fields") or []
            kept_field_ids: list[int] = []
            for f_order, fld_data in enumerate(fields_in):
                fid = fld_data.get("id")
                if fid:
                    try:
                        fld_obj = FormField.objects.get(pk=fid, form=form)
                    except FormField.DoesNotExist:
                        fld_obj = FormField(form=form)
                else:
                    fld_obj = FormField(form=form)

                fld_obj.form = form
                fld_obj.tab = tab_obj
                fld_obj.section = sec_obj
                fld_obj.label = (fld_data.get("label") or "Field")[:200]
                ft = fld_data.get("field_type") or FormField.TEXT
                if ft not in dict(FormField.FIELD_TYPES):
                    ft = FormField.TEXT
                fld_obj.field_type = ft
                fld_obj.required = bool(fld_data.get("required"))
                fld_obj.help_text = (fld_data.get("help_text") or "")[:300]
                fld_obj.choices = fld_data.get("choices") or ""
                fld_obj.max_length = fld_data.get("max_length")
                fld_obj.order = f_order
                col = int(fld_data.get("column") or 1)
                fld_obj.column = max(1, col)
                fld_obj.column_width = fld_data.get("column_width")
                role = fld_data.get("role") or FormField.ROLE_USER
                if role not in dict(FormField.ROLE_CHOICES):
                    role = FormField.ROLE_USER
                fld_obj.role = role
                fld_obj.placeholder = (fld_data.get("placeholder") or "")[:200]
                fld_obj.default_value = (fld_data.get("default_value") or "")[:200]
                fld_obj.min_value = fld_data.get("min_value")
                fld_obj.max_value = fld_data.get("max_value")
                fld_obj.regex = (fld_data.get("regex") or "")[:200]
                fld_obj.readonly = bool(fld_data.get("readonly"))
                fld_obj.hidden = bool(fld_data.get("hidden"))
                fld_obj.save()
                kept_field_ids.append(fld_obj.id)

            FormField.objects.filter(section=sec_obj).exclude(
                id__in=kept_field_ids
            ).delete()

        FormSection.objects.filter(tab=tab_obj).exclude(
            id__in=kept_section_ids
        ).delete()

    FormTab.objects.filter(form=form).exclude(id__in=kept_tab_ids).delete()

    return {"ok": True, "form": serialize_form_structure(Form.objects.get(pk=form.pk))}
