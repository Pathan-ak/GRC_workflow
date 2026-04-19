from django.contrib import admin
from django.urls import path, include
from viewflow.urls import Site, Application
from viewflow.workflow.flow import FlowAppViewset
from ticketflow.flows import TicketFlow
from ticketflow.views import StartFromTemplateView
from django.conf import settings
from django.conf.urls.static import static

site = Site(
    title="RISK Management",
    viewsets=[
        Application(
            title="GRC Functional Requests",
            app_name="ticketflow",
            viewsets=[FlowAppViewset(TicketFlow, icon="assignment")],
        ),
    ],
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/", include("django.contrib.auth.urls")),
    path("", site.urls),

    # existing compatibility endpoint
    path("ticketflow/start-from-template/", StartFromTemplateView.as_view(),
         name="start_from_template"),

    # NEW: dynamic GRC app (namespace = grc)
    path("grc/", include(("ticketflow.grc_urls", "grc"), namespace="grc")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)