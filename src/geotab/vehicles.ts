import type { ILocation, IMapAddInService } from "../types";

export interface VehicleLocation {
  id: string;
  name: string;
  location: ILocation | null;
  dateTime?: string;
}

/**
 * One multiCall per lookup — exactly the "precisely filtered" usage the Map
 * Add-In docs ask for (never Get all Devices from a map add-in).
 */
export async function getVehicle(service: IMapAddInService, deviceId: string): Promise<VehicleLocation> {
  const [devices, statuses] = await service.api.multiCall([
    ["Get", { typeName: "Device", search: { id: deviceId } }],
    ["Get", { typeName: "DeviceStatusInfo", search: { deviceSearch: { id: deviceId } } }],
  ]);
  const device = Array.isArray(devices) ? devices[0] : null;
  const status = Array.isArray(statuses) ? statuses[0] : null;
  const loc =
    status && typeof status.latitude === "number" && typeof status.longitude === "number"
      ? { lat: status.latitude, lng: status.longitude }
      : null;
  return {
    id: deviceId,
    name: device?.name ?? deviceId,
    location: loc,
    dateTime: status?.dateTime,
  };
}
