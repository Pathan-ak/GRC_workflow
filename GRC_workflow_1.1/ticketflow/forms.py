from django import forms
from django.core.validators import RegexValidator

from .models import Form as FormModel, FormField, TicketProcess
from .validators import validate_uploaded_file


# -------------------------------------------------
# CALCULATED FIELD LABELS (MUST MATCH ADMIN EXACTLY)
# -------------------------------------------------
CALCULATED_LABELS = {
    "Inherent Risk level (calculated)",
    "Residual Risk level (calculated)",
    "Overall Control Effectiveness (calculated)",
}


# -------------------------------------------------
# DYNAMIC FIELD INJECTION
# -------------------------------------------------
def add_fields_to_form(
    django_form,
    form_obj: FormModel,
    role=None,
    initial_map=None,
    exclude_labels=None,
    readonly=False,
):
    """
    role = None   -> START FORM (ONLY Risk Representative fields)
    role = value  -> APPROVAL STAGE (ONLY that role fields)
    """

    initial_map = initial_map or {}
    exclude_labels = exclude_labels or set()

    # -------------------------------------------------
    # 🔐 FIELD VISIBILITY LOGIC (CORE FIX)
    # -------------------------------------------------
    if role is None:
        # Start form → ONLY Risk Representative fields
        qs = form_obj.fields.filter(role=FormField.ROLE_USER)
    else:
        # Approval stage → ONLY current role fields
        qs = form_obj.fields.filter(role=role)

    # Get tabs ordered
    tabs = form_obj.tabs.all().order_by('order', 'id')
    
    # Get sections ordered (by tab, then order)
    sections = form_obj.sections.all().order_by('tab__order', 'tab__id', 'order', 'id')
    
    # Group fields by tab and section
    fields_by_tab_section = {}  # {tab_id: {section_id: [fields]}}
    fields_by_tab_no_section = {}  # {tab_id: [fields]}
    fields_no_tab_section = {}  # {section_id: [fields]} for sections without tab
    fields_no_tab_no_section = []  # Fields without tab or section
    
    for ff in qs:
        if ff.hidden or ff.label in exclude_labels:
            continue
        
        if ff.section:
            # Field belongs to a section
            section_id = ff.section.id
            if ff.section.tab:
                # Section belongs to a tab
                tab_id = ff.section.tab.id
                if tab_id not in fields_by_tab_section:
                    fields_by_tab_section[tab_id] = {}
                if section_id not in fields_by_tab_section[tab_id]:
                    fields_by_tab_section[tab_id][section_id] = []
                fields_by_tab_section[tab_id][section_id].append(ff)
            else:
                # Section without tab
                if section_id not in fields_no_tab_section:
                    fields_no_tab_section[section_id] = []
                fields_no_tab_section[section_id].append(ff)
        else:
            # Field doesn't belong to a section
            if ff.tab:
                # Field belongs to a tab directly
                tab_id = ff.tab.id
                if tab_id not in fields_by_tab_no_section:
                    fields_by_tab_no_section[tab_id] = []
                fields_by_tab_no_section[tab_id].append(ff)
            else:
                # Field without tab or section
                fields_no_tab_no_section.append(ff)

    # Helper function to create a field
    def create_field(ff):
        key = str(ff.id)
        init = (
            initial_map.get(key)
            or initial_map.get(ff.label)
            or ff.default_value
            or None
        )

        required = bool(ff.required) and not readonly
        label = ff.label.strip() if ff.label and ff.label.strip() else "Attachment"

        kwargs = dict(
            label=label,
            required=required,
            help_text=ff.help_text,
            initial=init,
        )

        if ff.regex:
            kwargs["validators"] = [RegexValidator(ff.regex)]

        # ---------- FIELD TYPES ----------
        if ff.field_type == FormField.TEXT:
            field = forms.CharField(**kwargs)

        elif ff.field_type == FormField.TEXTAREA:
            field = forms.CharField(
                widget=forms.Textarea(attrs={"rows": 4}),
                **kwargs,
            )

        elif ff.field_type == FormField.SELECT:
            choices = [
                (c.strip(), c.strip())
                for c in (ff.choices or "").split(",")
                if c.strip()
            ]
            field = forms.ChoiceField(choices=choices, **kwargs)

        elif ff.field_type == FormField.FILE:
            field = forms.FileField(
                validators=[validate_uploaded_file],
                required=required,
            )

        else:
            field = forms.CharField(**kwargs)

        # ---------- ADD FIELD ----------
        django_form.fields[key] = field

        # ---------- CALCULATED FIELDS ----------
        if ff.label in CALCULATED_LABELS:
            field.required = False
            # Don't use disabled - it prevents form submission
            # Use readonly instead and handle via hidden field
            field.widget.attrs["readonly"] = True
            field.widget.attrs["data-calculated"] = "true"

            # Hidden POST-safe mirror field for calculated fields
            django_form.fields[f"{key}__hidden"] = forms.CharField(
                required=False,
                initial=init,
                widget=forms.HiddenInput(),
            )

        elif ff.readonly or readonly:
            field.required = False
            # Use readonly instead of disabled to allow form submission
            field.widget.attrs["readonly"] = True
        
        return field, key, ff

    # Add fields grouped by tabs
    for tab in tabs:
        tab_sections = {}  # Sections in this tab
        tab_fields_no_section = fields_by_tab_no_section.get(tab.id, [])
        
        # Get sections for this tab
        for section in sections:
            if section.tab and section.tab.id == tab.id:
                tab_sections[section.id] = section
        
        # Process sections within this tab
        for section_id, section in tab_sections.items():
            if section_id in fields_by_tab_section.get(tab.id, {}):
                section_fields = sorted(
                    fields_by_tab_section[tab.id][section_id],
                    key=lambda f: (f.column, f.order)
                )
                
                for ff in section_fields:
                    field, key, ff_obj = create_field(ff)
                    
                    # Add tab and section metadata
                    field.tab_id = tab.id
                    field.tab_name = tab.name
                    field.section_id = section.id
                    field.section_name = section.name
                    field.column = ff.column
                    field.columns = section.columns
        
        # Process fields directly in tab (without section)
        for ff in tab_fields_no_section:
            field, key, ff_obj = create_field(ff)
            
            # Add tab metadata
            field.tab_id = tab.id
            field.tab_name = tab.name
            field.section_id = None
            field.section_name = None
            field.column = ff.column
            field.columns = 1  # Default to 1 column
    
    # Add sections without tabs
    sections_no_tab = [s for s in sections if not s.tab]
    for section in sections_no_tab:
        if section.id in fields_no_tab_section:
            section_fields = sorted(
                fields_no_tab_section[section.id],
                key=lambda f: (f.column, f.order)
            )
            
            for ff in section_fields:
                field, key, ff_obj = create_field(ff)
                
                # Add section metadata (no tab)
                field.tab_id = None
                field.tab_name = None
                field.section_id = section.id
                field.section_name = section.name
                field.column = ff.column
                field.columns = section.columns
    
    # Add fields without tab or section
    for ff in fields_no_tab_no_section:
        field, key, ff_obj = create_field(ff)
        
        # No tab or section metadata
        field.tab_id = None
        field.tab_name = None
        field.section_id = None
        field.section_name = None
        field.column = ff.column
        field.columns = 1


# -------------------------------------------------
# APPROVAL FORM
# -------------------------------------------------
class ApprovalForm(forms.ModelForm):
    class Meta:
        model = TicketProcess
        fields = []