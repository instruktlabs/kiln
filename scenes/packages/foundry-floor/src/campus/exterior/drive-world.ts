// SPDX-License-Identifier: MIT
// What the drive needs from the pack (FF-C1 item 5): the driving data (data/driving.json, a pack data entry), the six
// approved vehicles as instancing-ready geometry (./vehicles), the car's roads (../drive/car createCarWorld) and the
// traffic (./traffic). Built after the exterior's structures and ground, asynchronously (the vehicles' MSFT_lod levels
// load through the glTF parser); a pack without driving data has no drive and no traffic.
import type { LoadedPack } from '@kiln-scenes/scene-kit';
import type { CampusData, CampusTier } from '../data';
import { createCarWorld } from '../drive/car';
import type { CarBody, CarWorld } from '../drive/car';
import { DRIVING_DATA_ID, parseDriving, VEHICLE_TYPES, vehicleModelId } from '../drive/driving';
import type { DrivingData } from '../drive/driving';
import { createCampusTraffic } from './traffic';
import type { CampusTraffic } from './traffic';
import { carBody, extractVehicle } from './vehicles';
import type { VehicleModel } from './vehicles';
import { FREIGHT_TYPES, freightModelId, freightWheels } from './freight';

export interface DriveWorld {
  driving: DrivingData;
  models: ReadonlyMap<string, VehicleModel>;
  /** The driven car's measured body and its roads. */
  body: CarBody; roads: CarWorld;
  traffic: CampusTraffic;
  dispose(): void;
}

/** Null when the pack carries no driving data. */
export async function buildDriveWorld(data: CampusData, pack: LoadedPack, tier: CampusTier): Promise<DriveWorld | null> {
  const bytes = pack.data.get(DRIVING_DATA_ID);
  if (!bytes) return null;
  const driving = parseDriving(bytes);
  const required=[...VEHICLE_TYPES.map(type=>({type,id:vehicleModelId(type),wheelNames:undefined as readonly string[]|undefined})),
    ...(FREIGHT_TYPES.some(type=>pack.models.has(freightModelId(type)))?FREIGHT_TYPES.map(type=>({type,id:freightModelId(type),wheelNames:freightWheels(type)})):[])];
  for(const row of required)if(!pack.models.has(row.id))throw new Error(`The scene pack is missing ${row.id} for the drive`);
  // Settle the whole batch before cleanup: late successful decodes otherwise leak after an earlier rejection.
  const results=await Promise.allSettled(required.map(async row=>[row.type,await extractVehicle(row.type,pack.models.get(row.id)!,driving.lamps,driving.flow.paint.material,{wheelNames:row.wheelNames})] as const));
  const all=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
  const models = new Map<string, VehicleModel>(all.map(([type, e]) => [type, e.model]));
  const release = () => { for (const [, e] of all) e.release(); };
  try {
    const failed=results.find(result=>result.status==='rejected');
    if(failed?.status==='rejected')throw failed.reason;
    const car = models.get(driving.vehicle);
    if (!car) throw new Error(`data/driving.json vehicle ${driving.vehicle} is not one of the vehicles`);
    const traffic = createCampusTraffic({
      models, lanes: data.lanes, driving, tier, dissolve: data.roads.split.dissolve,
      halfLane: data.roads.split.lanes.width / 2, gradeY: data.roads.gradeY,
    });
    return {
      driving, models, body: carBody(car), roads: createCarWorld(data, driving), traffic,
      dispose() { traffic.dispose(); release(); },
    };
  } catch (error) {
    for (const model of models.values()) for (const geometry of model.lods) geometry.dispose();
    release();
    throw error;
  }
}
