// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 2 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = {name:"RCL 2406 — Red & Cream Diesel",category:"vehicle",role:"vehicle"};
function build(){
const root=createRoot("RCL_2406_Diesel");
const red=gameMaterial(0x173f2c,{metalness:.3,roughness:.36});
const brass=gameMaterial(0xb9954e,{metalness:.85,roughness:.26});
const cream=gameMaterial(0xf1dfb2,{metalness:.15,roughness:.44});
const dark=gameMaterial(0x242b30,{metalness:.6,roughness:.48});
const steel=gameMaterial(0x697278,{metalness:.85,roughness:.28});
const black=gameMaterial(0x10191f,{metalness:.25,roughness:.5});
const glass=gameMaterial(0x244650,{metalness:.55,roughness:.18});
const lamp=gameMaterial(0xffedba,{emissive:0xffd994,emissiveIntensity:.45,roughness:.2});
function box(n,w,h,d,x,y,z,m,p=root){return createPart(n,boxGeo(w,h,d),m,{position:[x,y,z],parent:p});}
function cyl(n,r,h,x,y,z,m,rot=[90,0,0],p=root,seg=32){return createPart(n,cylinderGeo(r,r,h,seg),m,{position:[x,y,z],rotation:rot,parent:p});}
function rod(n,a,b,r,m,p=root){
const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av);
const ob=createPart(n,cylinderGeo(r,r,v.length(),10),m,{position:av.clone().add(bv).multiplyScalar(.5).toArray(),parent:p});
ob.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return ob;
}
function pipe(n,pts,r,m,p=root){
const curve=new THREE.CatmullRomCurve3(pts.map(a=>new THREE.Vector3(...a)));
return createPart(n,new THREE.TubeGeometry(curve,Math.max(12,pts.length*5),r,6,false),m,{parent:p});
}
function prism(n,x0,x1,profile,m,p=root){
const v=[],idx=[],N=profile.length; for(const x of [x0,x1])for(const yz of profile)v.push(x,yz[0],yz[1]);
for(let i=1;i<N-1;i++){idx.push(0,i+1,i);idx.push(N,N+i,N+i+1);}
for(let i=0;i<N;i++){let j=(i+1)%N;idx.push(i,j,N+j,i,N+j,N+i);}
const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();
return createPart(n,g,m,{parent:p});
}
box("Main_sill",16.2,.32,2.9,0,1.56,0,dark);
box("Red_walkway_edge",16.35,.13,3.06,0,1.79,0,red);
box("Walkway_tread",16.25,.065,3.02,0,1.89,0,dark);
prism("Long_hood",-7.25,2.65,[[1.94,-1.06],[3.65,-1.06],[3.91,-.82],[3.91,.82],[3.65,1.06],[1.94,1.06]],red);
for(const s of [-1,1]){
box("Cream_hood_band_"+s,9.91,.42,.024,-2.3,3.06,s*1.079,cream);
box("Lower_cream_pinstripe_"+s,9.91,.055,.028,-2.3,2.77,s*1.079,cream);
for(let i=0;i<10;i++){
const x=-6.78+i*.92;
box("Engine_access_seam_"+s+"_"+i,.018,.70,.018,x,2.34,s*1.079,black);
box("Panel_handle_"+s+"_"+i,.16,.035,.05,x+.38,2.45,s*1.096,steel);
box("Panel_hinge_"+s+"_"+i,.065,.12,.044,x+.06,2.25,s*1.09,dark);
}
for(let j=0;j<3;j++){
let x=-6.37+j*1.07;
box("Radiator_recess_"+s+"_"+j,.9,.59,.034,x,3.5,s*1.08,black);
for(let k=0;k<7;k++)box("Radiator_louver_"+s+"_"+j+"_"+k,.83,.028,.048,x,3.26+k*.073,s*1.108,steel);
}
for(let j=0;j<2;j++){
box("Intake_recess_"+s+"_"+j,.7,.52,.03,1+j*.83,3.52,s*1.08,black);
for(let k=0;k<7;k++)box("Intake_grille_"+s+"_"+j+"_"+k,.025,.46,.045,.73+j*.83+k*.09,3.52,s*1.1,dark);
}
}
prism("Cab_shell",2.65,4.85,[[1.95,-1.43],[3.94,-1.43],[4.38,-1.04],[4.38,1.04],[3.94,1.43],[1.95,1.43]],red);
prism("Cream_cab_roof",2.49,5.00,[[3.99,-1.50],[4.46,-1.08],[4.50,-.8],[4.50,.8],[4.46,1.08],[3.99,1.50]],cream);
for(const s of [-1,1]){
box("Cab_cream_waist_"+s,2.21,.42,.026,3.75,3.06,s*1.447,cream);
box("Cab_window_seal_"+s,1.56,.73,.038,3.77,3.7,s*1.451,black);
box("Cab_side_glass_"+s,1.43,.61,.044,3.77,3.7,s*1.478,glass);
box("Cab_window_mullion_"+s,.055,.65,.057,3.64,3.7,s*1.505,cream);
box("Cab_sill_"+s,1.65,.055,.095,3.77,3.30,s*1.48,cream);
box("Cab_door_seam_"+s,.72,.94,.024,3.92,2.44,s*1.452,dark);
box("Cab_door_panel_"+s,.68,.90,.025,3.92,2.44,s*1.464,red);
box("Cab_door_latch_"+s,.17,.045,.07,4.13,2.71,s*1.5,steel);
}
for(const end of [2.633,4.872]){
for(const s of [-1,1]){
box("Windshield_gasket_"+end+"_"+s,.04,.70,.96,end,3.75,s*.66,black);
box("Windshield_glass_"+end+"_"+s,.055,.58,.84,end+(end>4?.025:-.025),3.75,s*.66,glass);
rod("Wiper_"+end+"_"+s,[end+(end>4?.068:-.068),3.47,s*.35],[end+(end>4?.068:-.068),3.91,s*.8],.013,dark);
}
}
prism("Short_nose",4.84,7.25,[[1.91,-1.06],[2.79,-1.06],[3.02,-.81],[3.02,.81],[2.79,1.06],[1.91,1.06]],red);
for(const s of [-1,1])box("Nose_cream_band_"+s,2.35,.32,.025,6.075,2.66,s*1.078,cream);
box("Front_nose_cream_band",.026,.32,2.13,7.27,2.66,0,cream);
box("Rear_cream_band",.026,.42,2.13,-7.27,3.06,0,cream);
// Roof fans: rings, radial blades, grille bars.
for(let i=0;i<3;i++){
let x=-5.9+i*1.55;
cyl("Fan_shroud_"+i,.61,.11,x,3.96,0,dark,[0,0,0]);
cyl("Fan_recess_"+i,.52,.12,x,3.97,0,black,[0,0,0]);
cyl("Fan_hub_"+i,.11,.15,x,4.02,0,steel,[0,0,0],root,20);
for(let j=0;j<10;j++){
let a=j*Math.PI/5;rod("Fan_radial_grille_"+i+"_"+j,[x+Math.cos(a)*.1,4.053,Math.sin(a)*.1],[x+Math.cos(a)*.56,4.053,Math.sin(a)*.56],.015,steel);
}
for(const r of [.27,.44,.59]){
const t=createPart("Fan_cage_ring_"+i+"_"+r,new THREE.TorusGeometry(r,.014,6,40),steel,{position:[x,4.057,0],rotation:[90,0,0],parent:root});
}
}
box("Exhaust_plinth",.7,.15,.65,-.70,3.98,0,dark);
cyl("Exhaust_stack",.18,.37,-.70,4.18,0,dark,[0,0,0],root,20);
cyl("Exhaust_dark_mouth",.135,.008,-.70,4.37,0,black,[0,0,0],root,20);
for(const s of [-1,1]){
cyl("Horn_"+s,.095,.39,3.16,4.61,s*.25,cream,[0,0,90],root,16);
cyl("Horn_bell_"+s,.14,.035,3.36,4.61,s*.25,dark,[0,0,90],root,20);
rod("Horn_mount_"+s,[3.05,4.44,s*.25],[3.05,4.6,s*.25],.025,dark);
}
rod("Antenna",[4.2,4.47,.15],[4.2,4.94,.15],.014,steel);
// Underbody tank and separate air reservoirs.
prism("Fuel_tank",-2.30,2.05,[[.34,-.85],[.34,.85],[.50,1.13],[1.32,1.13],[1.4,.95],[1.4,-.95],[1.32,-1.13],[.50,-1.13]],dark);
for(const x of [-1.8,1.5])for(const s of [-1,1])box("Tank_strap_"+x+"_"+s,.13,.80,.035,x,.91,s*1.15,steel);
for(const s of [-1,1]){
cyl("Air_reservoir_"+s,.21,2.7,-.1,1.28,s*1.32,dark,[0,0,90]);
cyl("Fuel_cap_"+s,.11,.06,.65,1.19,s*1.19,steel);
pipe("Air_line_"+s,[[-2.6,1.30,s*1.37],[-1.8,1.48,s*1.37],[1.7,1.48,s*1.37],[2.65,1.20,s*1.37]],.032,steel);
}
// Six powered axles, flanges, recessed wheel faces, exposed truck frames.
for(const c of [-4.75,4.75]){
const truck=createPivot(c<0?"Rear_truck":"Front_truck",[c,0,0],root);
box("Truck_cross_bolster",1.1,.30,2.35,0,1.14,0,dark,truck);
cyl("Truck_pivot",.4,.26,0,1.40,0,steel,[0,0,0],truck);
for(const a of [-1.28,0,1.28]){
cyl("Axle_"+a,.125,2.41,a,.59,0,steel,[90,0,0],truck,20);
cyl("Traction_motor_"+a,.27,.96,a+.28,.72,0,dark,[90,0,0],truck,20);
for(const s of [-1,1]){
cyl("Wheel_tread_"+a+"_"+s,.59,.19,a,.59,s*.84,steel,[90,0,0],truck,48);
cyl("Wheel_flange_"+a+"_"+s,.635,.047,a,.59,s*.733,dark,[90,0,0],truck,48);
cyl("Wheel_dished_face_"+a+"_"+s,.46,.032,a,.59,s*.955,dark,[90,0,0],truck,40);
cyl("Wheel_hub_"+a+"_"+s,.20,.11,a,.59,s*1.008,steel,[90,0,0],truck,24);
cyl("Axle_box_round_"+a+"_"+s,.185,.23,a,.59,s*1.16,dark,[90,0,0],truck,24);
box("Axle_box_cover_"+a+"_"+s,.30,.29,.06,a,.59,s*1.31,steel,truck);
for(const dx of [-.10,.10])for(const dy of [-.095,.095])cyl("Axlebox_bolt",.026,.028,a+dx,.59+dy,s*1.358,dark,[90,0,0],truck,8);
for(const dx of [-.43,.43]){
box("Brake_shoe",.12,.32,.19,a+dx,.57,s*.91,dark,truck);
rod("Brake_hanger",[a+dx,.66,s*1.01],[a+dx*.87,1.03,s*1.02],.038,steel,truck);
}
}
}
for(const s of [-1,1]){
box("Truck_upper_frame_"+s,3.55,.18,.24,0,1.06,s*1.18,dark,truck);
box("Truck_lower_tie_"+s,3.22,.105,.16,0,.37,s*1.18,dark,truck);
for(const x of [-.66,.66]){
box("Spring_bottom_seat",.54,.09,.35,x,.64,s*1.2,steel,truck);
box("Spring_upper_seat",.54,.07,.35,x,1.05,s*1.2,steel,truck);
for(const dx of [-.14,.14]){
const pts=[];for(let k=0;k<=64;k++){let a=k/64*Math.PI*12;pts.push([x+dx+.082*Math.cos(a),.70+k/64*.28,s*1.2+.082*Math.sin(a)]);}
pipe("Suspension_coil",pts,.023,steel,truck);
}
rod("Suspension_diagonal",[x-.24,.43,s*1.23],[x+.22,.93,s*1.23],.055,dark,truck);
}
rod("Brake_pull_rod",[-1.69,.79,s*1.37],[1.69,.79,s*1.37],.03,steel,truck);
for(const ax of [-1.28,0,1.28])rod("Brake_cross_link",[ax+.38,.91,s*1.02],[ax+.38,.79,s*1.37],.035,steel,truck);
cyl("Brake_cylinder",.115,.46,.62,1.20,s*1.19,dark,[0,0,90],truck,16);
for(const x of [-1.7,1.7])rod("Frame_end_taper",[x,1.06,s*1.18],[x*.90,.38,s*1.18],.08,dark,truck);
}
}
// End pilots, knuckle couplers, hoses and steps.
for(const e of [-1,1]){
box("Pilot_beam_"+e,.23,.64,2.88,e*8.13,1.16,0,red);
prism("Pilot_plow_"+e,e*8.13-.16,e*8.13+.16,[[.28,-1.30],[.28,1.30],[.94,1.43],[.94,-1.43]],dark);
box("Coupler_shank_"+e,.67,.19,.24,e*8.51,.94,0,steel);
box("Coupler_head_"+e,.30,.28,.40,e*8.85,.96,0,dark);
box("Coupler_knuckle_"+e,.18,.27,.16,e*8.99,.96,.17,steel);
for(const s of [-1,1]){
pipe("Brake_hose_"+e+"_"+s,[[e*8.3,1.28,s*.49],[e*8.53,.99,s*.55],[e*8.49,.56,s*.61],[e*8.30,.58,s*.65]],.042,black);
box("End_marker_housing_"+e+"_"+s,.1,.16,.18,e*7.32,2.23,s*.79,dark);
cyl("End_marker_lens_"+e+"_"+s,.06,.045,e*7.39,2.23,s*.79,lamp,[0,0,90],root,16);
for(let i=0;i<4;i++){
box("Entry_step_"+e+"_"+s,.59,.09,.40,e*(7.63+.07*i),.52+i*.35,s*1.28,steel);
}
rod("Step_outer_stringer_"+e+"_"+s,[e*7.9,.44,s*1.49],[e*7.6,1.88,s*1.49],.047,dark);
}
for(const y of [2.92,3.17]){
cyl("Headlight_bezel_"+e+"_"+y,.135,.09,e*(e>0?4.94:7.34),e>0?y+.89:y+.33,0,steel,[0,0,90]);
cyl("Headlight_lens_"+e+"_"+y,.102,.10,e*(e>0?4.97:7.37),e>0?y+.89:y+.33,0,lamp,[0,0,90]);
}
}
// Safety rails: side walkways and end returns.
for(const s of [-1,1]){
for(const range of [[-7.85,2.5],[5.1,7.9]]){
rod("Cream_top_handrail",[range[0],2.79,s*1.43],[range[1],2.79,s*1.43],.032,brass);
const count=Math.ceil((range[1]-range[0])/1.4);
for(let i=0;i<=count;i++){
let x=range[0]+(range[1]-range[0])*i/count;
rod("Handrail_stanchion",[x,1.91,s*1.43],[x,2.79,s*1.43],.028,brass);
box("Stanchion_foot",.09,.10,.09,x,1.96,s*1.43,dark);
}
}
for(const e of [-1,1]){
rod("End_handrail",[e*7.91,2.79,s*1.43],[e*7.91,2.79,s*.40],.032,brass);
rod("End_gate_upright",[e*7.91,1.93,s*.4],[e*7.91,2.79,s*.4],.03,brass);
}
}
// Crisp geometry-based road numbers.
const glyphs={"2":[0,1,6,4,3],"4":[5,6,1,2],"0":[0,1,2,3,4,5],"6":[0,5,6,4,3,2]};
function number(s){
const str="2406",sz=.30,base=-1.43;
for(let i=0;i<4;i++){let x=base+i*.39;for(const a of glyphs[str[i]]){
const xy=[[0,.2],[.1,.1],[.1,-.1],[0,-.2],[-.1,-.1],[-.1,.1],[0,0]][a];
box("Road_number_"+s+"_"+i+"_"+a,a===0||a===3||a===6?.19:.038,a===0||a===3||a===6?.035:.18,.018,x+xy[0],3.48+xy[1],s*1.087,cream);
}}
}
number(-1);number(1);
const nameCounts={};root.traverse(o=>{const n=o.name||"Part";nameCounts[n]=(nameCounts[n]||0)+1;if(nameCounts[n]>1)o.name=n+"_"+nameCounts[n];});
root.position.y=.045;
return root;
}