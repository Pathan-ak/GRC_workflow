# ticketflow/models.py
from django.conf import settings
from django.db import models
from viewflow.workflow.models import Process
from viewflow import jsonstore

from .dynamic_models import WorkflowTemplate


class Form(models.Model):
    name = models.CharField(max_length=200)
    notify_emails = models.TextField(
        blank=True,
        help_text="Comma-separated emails to notify when this form is submitted",
    )
    created = models.DateTimeField(auto_now_add=True)

    workflow_template = models.ForeignKey(
        WorkflowTemplate,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="default_for_forms",
        help_text="If set, new requests with this form will use this workflow template by default.",
    )

    def __str__(self) -> str:
        return self.name


class FormTab(models.Model):
    """
    Represents a tab within a form to organize sections and fields.
    Tabs provide a top-level organization structure.
    """
    form = models.ForeignKey(Form, related_name="tabs", on_delete=models.CASCADE)
    name = models.CharField(max_length=200, help_text="Tab name (e.g., 'General', 'Risk')")
    description = models.TextField(blank=True, help_text="Optional tab description")
    order = models.PositiveIntegerField(default=0, help_text="Order of tab within the form")
    icon = models.CharField(
        max_length=50,
        blank=True,
        help_text="Optional icon class or name (e.g., 'fa-home', 'icon-general')"
    )
    
    class Meta:
        ordering = ["order", "id"]
        verbose_name = "Form Tab"
        verbose_name_plural = "Form Tabs"
    
    def __str__(self):
        return f"{self.form.name} / {self.name}"


class FormSection(models.Model):
    """
    Represents a section/group within a form to organize fields.
    Sections can belong to a tab or be directly under the form.
    """
    form = models.ForeignKey(Form, related_name="sections", on_delete=models.CASCADE)
    tab = models.ForeignKey(
        'FormTab',
        related_name="sections",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Tab this section belongs to (leave empty for no tab)"
    )
    name = models.CharField(max_length=200, help_text="Section name (e.g., 'General Section')")
    description = models.TextField(blank=True, help_text="Optional section description")
    order = models.PositiveIntegerField(default=0, help_text="Order of section within the tab/form")
    is_collapsible = models.BooleanField(
        default=False, 
        help_text="Allow users to collapse/expand this section"
    )
    columns = models.PositiveIntegerField(
        default=1, 
        help_text="Number of columns in this section (1-4)"
    )
    
    class Meta:
        ordering = ["tab__order", "tab__id", "order", "id"]
        verbose_name = "Form Section"
        verbose_name_plural = "Form Sections"
    
    def __str__(self):
        return f"{self.form.name} / {self.name}"


class FormField(models.Model):
    TEXT = "text"
    TEXTAREA = "textarea"
    SELECT = "select"
    FILE = "file"
    EMAIL = "email"
    DATE = "date"
    NUMBER = "number"
    CHECKBOX = "checkbox"
    RADIO = "radio"

    FIELD_TYPES = [
        (TEXT, "Text"),
        (TEXTAREA, "Long text"),
        (SELECT, "Drop-down"),
        (FILE, "File upload"),
        (EMAIL, "Email"),
        (DATE, "Date (YYYY-MM-DD)"),
        (NUMBER, "Number"),
        (CHECKBOX, "Checkbox"),
        (RADIO, "Radio"),
    ]

    ROLE_USER = "user"
    ROLE_DEV = "dev"
    ROLE_BA = "ba"
    ROLE_PM = "pm"

    ROLE_CHOICES = [
        (ROLE_USER, "Risk Representative"),
        (ROLE_DEV, "Risk Champion"),
        (ROLE_BA, "Risk Approver"),
        (ROLE_PM, "CRO"),
    ]

    form = models.ForeignKey(Form, related_name="fields", on_delete=models.CASCADE)
    tab = models.ForeignKey(
        'FormTab',
        related_name="fields",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Tab this field belongs to (only if field is not in a section)"
    )
    section = models.ForeignKey(
        'FormSection',
        related_name="fields",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Section this field belongs to (leave empty for no section)"
    )

    label = models.CharField(max_length=200)
    field_type = models.CharField(max_length=20, choices=FIELD_TYPES, default=TEXT)
    required = models.BooleanField(default=False)
    help_text = models.CharField(max_length=300, blank=True)
    choices = models.TextField(blank=True)
    max_length = models.PositiveIntegerField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    
    # Column support for multi-column layout
    column = models.PositiveIntegerField(
        default=1,
        help_text="Column number within the section (1, 2, 3, etc.)"
    )
    column_width = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Column width percentage (optional, for flexible layouts)"
    )

    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_USER)

    placeholder = models.CharField(max_length=200, blank=True, default="")
    default_value = models.CharField(max_length=200, blank=True, default="")
    min_value = models.IntegerField(null=True, blank=True)
    max_value = models.IntegerField(null=True, blank=True)
    regex = models.CharField(max_length=200, blank=True, default="")
    readonly = models.BooleanField(default=False)
    hidden = models.BooleanField(default=False)

    class Meta:
        ordering = ["tab__order", "tab__id", "section__order", "section__id", "order", "column", "id"]

    def __str__(self) -> str:
        return f"{self.form.name} / {self.label}"


class FormEntry(models.Model):
    form = models.ForeignKey(Form, related_name="entries", on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Entry #{self.id} / {self.form.name}"


class FormEntryValue(models.Model):
    entry = models.ForeignKey(FormEntry, related_name="values", on_delete=models.CASCADE)
    field = models.ForeignKey(FormField, on_delete=models.CASCADE)
    value_text = models.TextField(blank=True)
    value_file = models.FileField(upload_to="form_uploads/", null=True, blank=True)

    def __str__(self) -> str:
        val = self.value_text or (self.value_file.name if self.value_file else "")
        return f"{self.field.label} = {val}"


class TicketProcess(Process):
    form = models.ForeignKey(Form, on_delete=models.PROTECT)

    entry = models.OneToOneField(
        FormEntry,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ticket_process",
    )

    ticket_data = jsonstore.JSONField(default=dict)

    # ✅ DECISIONS (RENAMED FOR DISPLAY ONLY)
    user_decision = jsonstore.CharField(
        max_length=10,
        blank=True,
        verbose_name="Risk Representative decision",
    )
    dev_decision = jsonstore.CharField(
        max_length=10,
        blank=True,
        verbose_name="Risk Champion decision",
    )
    ba_decision = jsonstore.CharField(
        max_length=10,
        blank=True,
        verbose_name="Risk Approver decision",
    )
    pm_decision = jsonstore.CharField(
        max_length=10,
        blank=True,
        verbose_name="CRO decision",
    )

    approved_by_user = jsonstore.CharField(
        max_length=100,
        blank=True,
        verbose_name="Approved by Risk Representative",
    )
    approved_by_dev = jsonstore.CharField(
        max_length=100,
        blank=True,
        verbose_name="Approved by Risk Champion",
    )
    approved_by_ba = jsonstore.CharField(
        max_length=100,
        blank=True,
        verbose_name="Approved by Risk Approver",
    )
    approved_by_pm = jsonstore.CharField(
        max_length=100,
        blank=True,
        verbose_name="Approved by CRO",
    )

    user_comment = jsonstore.TextField(
        blank=True,
        verbose_name="Risk Representative comment",
    )
    dev_comment = jsonstore.TextField(
        blank=True,
        verbose_name="Risk Champion comment",
    )
    ba_comment = jsonstore.TextField(
        blank=True,
        verbose_name="Risk Approver comment",
    )
    pm_comment = jsonstore.TextField(
        blank=True,
        verbose_name="CRO comment",
    )

    workflow_template = models.ForeignKey(
        WorkflowTemplate,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="processes",
    )

    def __str__(self) -> str:
        return f"TicketProcess for {self.form.name}"