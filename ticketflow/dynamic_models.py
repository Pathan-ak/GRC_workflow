from django.db import models


# ---- Role constants ----
ROLE_USER = "user"
ROLE_DEV = "dev"
ROLE_BA = "ba"
ROLE_PM = "pm"

ROLE_CHOICES = [
    (ROLE_USER, "Risk Representative"),
    (ROLE_DEV,  "Risk Champion"),
    (ROLE_BA,   "Risk Approver"),
    (ROLE_PM,   "CRO"),
]


class WorkflowTemplate(models.Model):
    """
    A reusable workflow definition composed of ordered WorkflowStage records.
    You can select one of these templates in the Form admin as the default workflow.
    """

    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Workflow template"
        verbose_name_plural = "Workflow templates"

    def __str__(self) -> str:
        return self.name


class WorkflowStage(models.Model):
    """
    A single approval/review stage inside a WorkflowTemplate.
    Each stage corresponds to one role (Risk Representative, Risk Champion, etc.).
    """

    template = models.ForeignKey(
        WorkflowTemplate,
        related_name="stages",
        on_delete=models.CASCADE,
    )
    order = models.PositiveIntegerField(default=1)
    name = models.CharField(max_length=200)
    role = models.CharField(max_length=16, choices=ROLE_CHOICES)
    show_in_diagram = models.BooleanField(
        default=True,
        help_text="Whether to show this stage in the workflow diagram view",
    )

    class Meta:
        ordering = ["template", "order", "id"]
        verbose_name = "Workflow stage"
        verbose_name_plural = "Workflow stages"

    def __str__(self) -> str:
        return f"{self.template.name} / {self.order}. {self.name}"