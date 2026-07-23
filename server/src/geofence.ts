export type GeofenceBranch = {
  branchId: string;
  branchName: string;
  latitude: number;
  longitude: number;
  attendanceRadiusMeters: number;
};

const EARTH_RADIUS_METERS = 6_371_000;

function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestBranch(
  location: { latitude: number; longitude: number },
  branches: GeofenceBranch[],
) {
  return branches
    .map((branch) => ({ branch, distance: distanceMeters(location, branch) }))
    .sort((first, second) => first.distance - second.distance)[0];
}
