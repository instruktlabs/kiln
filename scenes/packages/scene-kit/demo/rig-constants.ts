// CollisionWorld capsules require height >= diameter. A shorter capsule overlaps
// the floor at rest and falsely rejects every horizontal vehicle movement.
export const DEMO_CAR_COLLIDER = Object.freeze({ radius: .8, height: 1.8 });
