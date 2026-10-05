// Scene DPR/shadow policies; runtime-policy selects the default device tier.
// Reference remains available for comparisons and explicit overrides.
const tiers=Object.freeze({reference:{cap:1.5,shadows:true,shadowMapSize:2048},balanced:{cap:1.5,shadows:true,shadowMapSize:1024},economy:{cap:.75,shadows:true,shadowMapSize:512},minimal:{cap:.6,shadows:false,shadowMapSize:512}});
export function renderTierSettings(name='reference',deviceRatio=1){const tier=Object.hasOwn(tiers,name)?tiers[name]:null;if(!tier||!Number.isFinite(deviceRatio)||deviceRatio<=0)throw Error('Invalid render tier or device ratio');return{name,pixelRatio:Math.min(deviceRatio,tier.cap),shadows:tier.shadows,shadowMapSize:tier.shadowMapSize};}
