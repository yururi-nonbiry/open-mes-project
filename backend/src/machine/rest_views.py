from rest_framework import viewsets

from base.permissions import IsAuthenticatedCreateAdminChange
from base.viewsets import CustomSuccessMessageMixin

from .models import Machine
from .serializers import MachineCreateUpdateSerializer, MachineSerializer


class MachineViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    """
    API endpoint for managing machines.
    """

    queryset = Machine.objects.all().order_by("machine_number")
    permission_classes = [IsAuthenticatedCreateAdminChange]

    def get_serializer_class(self):
        if self.action in ["list"]:
            return MachineSerializer
        return MachineCreateUpdateSerializer
