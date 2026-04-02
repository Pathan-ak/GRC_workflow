from django import template
from django.forms import BoundField

register = template.Library()


@register.filter
def get_item(dictionary, key):
    """Template filter to get item from dictionary."""
    return dictionary.get(key)


@register.filter
def endswith(value, arg):
    """Template filter to check if string ends with suffix."""
    if not value or not arg:
        return False
    return str(value).endswith(str(arg))


@register.inclusion_tag('ticketflow/form_section_fields.html', takes_context=True)
def render_form_by_sections(context, form, form_obj=None):
    """
    Render form fields grouped by tabs and sections with multi-column layout.
    
    Usage: {% render_form_by_sections form form_obj %}
    """
    if not form_obj:
        return {
            'form': form, 
            'tabs': [], 
            'sections': [], 
            'fields_no_section': [], 
            'processed_fields': set()
        }
    
    # Get tabs ordered
    tabs = form_obj.tabs.all().order_by('order', 'id')
    
    # Get sections ordered (by tab, then order)
    sections = form_obj.sections.all().order_by('tab__order', 'tab__id', 'order', 'id')
    
    # Group form fields by tab and section
    tabs_with_content = []
    fields_by_tab_section = {}  # {tab_id: {section_id: [field_data]}}
    fields_by_tab_no_section = {}  # {tab_id: [field_data]}
    fields_by_section_no_tab = {}  # {section_id: [field_data]} for sections without tab
    sections_no_tab_with_fields = []
    fields_no_tab_no_section = []
    processed_fields = set()
    
    # Iterate through form fields and group them
    for field_name, field in form.fields.items():
        # Skip hidden fields and special fields
        if field_name.endswith('__hidden') or field_name == 'form':
            continue
        
        # Get the field object from form_obj
        try:
            field_id = int(field_name)
            form_field = form_obj.fields.get(id=field_id)
            processed_fields.add(field_name)
            
            # Get bound field - try to access it from the form
            bound_field = None
            try:
                # Access bound field using form[field_name]
                bound_field = form[field_name]
            except (KeyError, AttributeError, TypeError):
                pass
            
            field_data = {
                'form_field': form_field,
                'django_field': field,
                'field_name': field_name,
                'bound_field': bound_field,
            }
            
            if form_field.section:
                # Field belongs to a section
                section_id = form_field.section.id
                if form_field.section.tab:
                    # Section belongs to a tab
                    tab_id = form_field.section.tab.id
                    if tab_id not in fields_by_tab_section:
                        fields_by_tab_section[tab_id] = {}
                    if section_id not in fields_by_tab_section[tab_id]:
                        fields_by_tab_section[tab_id][section_id] = []
                    fields_by_tab_section[tab_id][section_id].append(field_data)
                else:
                    # Section without tab - collect for sections_no_tab_with_fields
                    if section_id not in fields_by_section_no_tab:
                        fields_by_section_no_tab[section_id] = []
                    fields_by_section_no_tab[section_id].append(field_data)
            else:
                # Field doesn't belong to a section
                if form_field.tab:
                    # Field belongs to a tab directly
                    tab_id = form_field.tab.id
                    if tab_id not in fields_by_tab_no_section:
                        fields_by_tab_no_section[tab_id] = []
                    fields_by_tab_no_section[tab_id].append(field_data)
                else:
                    # Field without tab or section
                    fields_no_tab_no_section.append(field_data)
        except (ValueError, form_obj.fields.model.DoesNotExist):
            # Field not found, skip it
            continue
    
    # Build tabs with their sections and fields
    for tab in tabs:
        tab_sections = []
        tab_fields_no_section = fields_by_tab_no_section.get(tab.id, [])
        
        # Get sections for this tab
        for section in sections:
            if section.tab and section.tab.id == tab.id:
                section_fields = []
                if tab.id in fields_by_tab_section and section.id in fields_by_tab_section[tab.id]:
                    section_fields = sorted(
                        fields_by_tab_section[tab.id][section.id],
                        key=lambda f: (f['form_field'].column, f['form_field'].order)
                    )
                if section_fields:
                    tab_sections.append({
                        'section': section,
                        'fields': section_fields,
                    })
        
        tabs_with_content.append({
            'tab': tab,
            'sections': tab_sections,
            'fields_no_section': tab_fields_no_section,
        })
    
    # Build sections without tabs
    for section in sections:
        if not section.tab and section.id in fields_by_section_no_tab:
            section_fields = sorted(
                fields_by_section_no_tab[section.id],
                key=lambda f: (f['form_field'].column, f['form_field'].order)
            )
            sections_no_tab_with_fields.append({
                'section': section,
                'fields': section_fields,
            })
    
    return {
        'form': form,
        'tabs': tabs_with_content,
        'sections': sections_no_tab_with_fields,
        'fields_no_section': fields_no_tab_no_section,
        'processed_fields': processed_fields,
    }
