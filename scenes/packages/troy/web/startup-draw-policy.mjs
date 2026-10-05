export function startupDrawPolicy(mode){
 if(!['passes','draws','landingPasses','landingDraw'].includes(mode))throw Error('Invalid startup pass mode');
 return {root:['passes','draws'].includes(mode)?'scene':'later-landing-wave',precompile:!['draws','landingDraw'].includes(mode),admitVariants:true};
}
