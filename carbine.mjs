import * as THREE from './vendor/three.module.js';

function materialTexture(brushed) {
  const size = 96;
  const pixels = new Uint8Array(size * size * 4);
  let state = 8971;
  for (let y = 0; y < size; y++) {
    const grain = brushed ? Math.sin(y * 2.12) * 10 : 0;
    for (let x = 0; x < size; x++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const noise = ((state >>> 24) / 255 - .5) * (brushed ? 19 : 29);
      const stain = Math.sin(x * .122 + y * .109) * Math.cos(y * .187 - x * .056) * 5;
      const value = Math.round(226 + grain + noise + stain);
      const index = (y * size + x) * 4;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(2.5, 3.5);
  texture.needsUpdate = true;
  return texture;
}

export function createCarbine() {
  const model = new THREE.Group();
  const brushed = materialTexture(true);
  const molded = materialTexture(false);
  const metal = new THREE.MeshStandardMaterial({ color: 0x797e7c, metalness: .78, roughness: .37, map: brushed, roughnessMap: brushed });
  const dark = new THREE.MeshStandardMaterial({ color: 0x303539, metalness: .59, roughness: .47, map: brushed });
  const edge = new THREE.MeshStandardMaterial({ color: 0xa4a9a5, metalness: .9, roughness: .28, map: brushed });
  const ivory = new THREE.MeshStandardMaterial({
    color: 0xbeb6a3, metalness: .18, roughness: .52,
    map: molded, roughnessMap: molded, bumpMap: molded, bumpScale: .0011,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: .82, map: molded });
  const green = new THREE.MeshStandardMaterial({ color: 0x4c9a60, emissive: 0x4ebf74, emissiveIntensity: 1.08, metalness: .33, roughness: .22 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x548d76, transparent: true, opacity: .26, metalness: .18, roughness: .13, clearcoat: 1, depthWrite: false });

  function mesh(geometry, material, x, y, z, parent = model) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x,y,z);
    parent.add(part);
    return part;
  }

  function panel(width, height, length, radius, material, x, y, z, parent) {
    const hw = width / 2 - radius;
    const hh = height / 2 - radius;
    const shape = new THREE.Shape();
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, hh);
    shape.lineTo(-hw, hh);
    shape.closePath();
    const body = new THREE.ExtrudeGeometry(shape, {
      depth: length - 2 * radius, bevelEnabled: true, bevelThickness: radius,
      bevelSize: radius, bevelSegments: 2, steps: 1,
    });
    body.translate(0, 0, -length / 2 + radius);
    return mesh(body,material,x,y,z,parent);
  }

  function tube(radius, length, material, x, y, z, parent) {
    const part = mesh(new THREE.CylinderGeometry(radius,radius,length,18),material,x,y,z,parent);
    part.rotation.x = Math.PI / 2;
    return part;
  }

  function contour(path, points) {
    path.moveTo(...points[0]);
    for (const point of points.slice(1)) path.lineTo(...point);
    path.closePath();
    return path;
  }

  function sidePlate(points, thickness, material, x) {
    const shape = contour(new THREE.Shape(), points);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness, bevelEnabled: true, bevelThickness: .002, bevelSize: .002, bevelSegments: 2,
    });
    const part = mesh(geometry, material, x, 0, 0);
    part.rotation.y = -Math.PI / 2;
    return part;
  }

  panel(.17,.125,.56,.011,dark,0,0,-.20);
  panel(.155,.11,.29,.012,metal,0,.02,-.045);
  panel(.147,.095,.24,.012,dark,0,-.006,.207);
  panel(.164,.122,.05,.014,rubber,0,-.011,.327);
  panel(.16,.066,.29,.013,ivory,0,.023,.115);
  panel(.113,.027,.18,.008,dark,0,.058,.16);
  panel(.094,.015,.144,.005,rubber,0,.071,.169);
  for (let i = 0; i < 6; i++) panel(.088,.003,.004,.001,metal,0,.078,.111 + i * .022);
  panel(.168,.074,.26,.009,ivory,0,-.018,-.382);
  tube(.022,.29,metal,0,.024,-.527);
  tube(.035,.12,dark,0,.024,-.688);
  tube(.041,.062,metal,0,.024,-.731);
  for(let i=0;i<5;i++) tube(.038,.006,dark,0,.024,-.692 - i*.012);

  const screw = new THREE.CylinderGeometry(.010,.010,.009,12);
  for (const sign of [-1,1]) {
    sidePlate([[-.097, -.011], [-.047, -.027], [.098, -.027], [.142, -.006], [.124, .04], [-.077, .046]], .01, ivory, sign < 0 ? -.078 : .088);
    panel(.014,.058,.22,.005,metal,.083*sign,-.003,-.254);
    panel(.015,.027,.173,.004,dark,.091*sign,.009,-.225);
    tube(.012,.144,green,.102*sign,.009,-.225);
    for(const z of [-.32,-.145,.102]) {
      const fastener=mesh(screw,edge,.094*sign,.032,z);
      fastener.rotation.z = Math.PI / 2;
      panel(.002,.002,.011,.0004,dark,.100 * sign,.032,z);
    }
    for(let i=0;i<8;i++) panel(.016,.033,.012,.002,dark,.089*sign,-.016,-.48+i*.022).rotation.x=.25;
    panel(.007,.008,.091,.002,green,.091*sign,.036,.076);
    panel(.012,.012,.073,.002,dark,.093*sign,.019,.06);
    panel(.014,.011,.022,.002,metal,.1*sign,.021,.084);
  }

  panel(.079,.020,.48,.004,dark,0,.073,-.254);
  for(let i=0;i<18;i++) panel(.088,.013,.014,.003,metal,0,.086,-.47+i*.024);
  panel(.104,.024,.112,.006,dark,0,.102,-.115);
  const optic = contour(new THREE.Shape(), [
    [-.051,-.034],[.051,-.034],[.053,.015],[.039,.035],[-.039,.035],[-.053,.015],
  ]);
  optic.holes.push(contour(new THREE.Path(), [
    [-.035,-.02],[-.037,.011],[-.027,.022],[.027,.022],[.037,.011],[.035,-.02],
  ]));
  const opticHousing = new THREE.ExtrudeGeometry(optic, {
    depth: .055, bevelEnabled: true, bevelThickness: .006, bevelSize: .005, bevelSegments: 3,
  });
  mesh(opticHousing, metal, 0, .142, -.153);
  panel(.071,.038,.004,.0015,glass,0,.142,-.143);
  mesh(new THREE.SphereGeometry(.0029,12,8),green,0,.142,-.137);
  for (const x of [-.045, .045]) {
    tube(.0054,.003,edge,x,.125,-.091);
    tube(.0054,.003,edge,x,.154,-.091);
  }
  const adjuster = mesh(new THREE.CylinderGeometry(.012,.012,.016,18),dark,.056,.144,-.124);
  adjuster.rotation.z = Math.PI / 2;
  const sight = new THREE.Object3D();
  sight.position.set(0,.142,-.115);
  model.add(sight);

  const magazine = new THREE.Group();
  magazine.position.set(0,-.085,-.235);
  panel(.083,.145,.127,.009,dark,0,-.06,0,magazine).rotation.x=.16;
  panel(.09,.026,.139,.006,metal,0,-.132,-.013,magazine);
  for(let i=0;i<5;i++) panel(.087,.009,.090,.003,metal,0,-.027-i*.02,-.008,magazine);
  model.add(magazine);

  panel(.082,.132,.092,.013,dark,0,-.088,.047).rotation.x=-.32;
  panel(.034,.016,.114,.004,metal,0,-.123,-.057);
  panel(.034,.047,.015,.004,metal,0,-.106,-.112);
  panel(.019,.048,.013,.004,metal,0,-.082,-.02).rotation.x=.3;

  const palmGeometry = new THREE.SphereGeometry(1,20,14);
  function gauntlet(x,y,z,front) {
    const hand = new THREE.Group();
    hand.position.set(x,y,z);
    model.add(hand);
    const palm = mesh(palmGeometry,rubber,0,-.025,.03,hand);
    palm.scale.set(.055,.067,.085);
    const arm = mesh(new THREE.CapsuleGeometry(.058,.28,5,14),rubber,.03,-.082,.183,hand);
    arm.rotation.x = 1.08;
    arm.rotation.z = front ? .28 : -.14;
    panel(.102,.044,.17,.012,dark,.03,-.056,.156,hand).rotation.x=-.45;
    panel(.093,.019,.125,.006,metal,.03,-.039,.157,hand).rotation.x=-.45;
    for(let i=0;i<4;i++) {
      const finger = mesh(new THREE.CapsuleGeometry(.012,.049,4,10),rubber,-.035+i*.021,.016,.004,hand);
      finger.rotation.x = front ? .65 : -.42;
      panel(.020,.013,.025,.004,dark,-.035+i*.021,.034,.016,hand);
    }
    const thumb = mesh(new THREE.CapsuleGeometry(.019,.037,5,12),rubber,front?-.044:.046,.025,.011,hand);
    thumb.rotation.z = front ? -.6 : .62;
    return hand;
  }
  const supportHand = gauntlet(-.074,-.082,-.365,true);
  gauntlet(.045,-.117,.050,false);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0,.024,-.772);
  model.add(muzzle);
  const flash = new THREE.Group();
  const blast = new THREE.MeshBasicMaterial({ color: 0xffe5a2, transparent: true, opacity: .88, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
  const cone = mesh(new THREE.ConeGeometry(.057,.28,6),blast,0,0,-.14,flash);
  cone.rotation.x = -Math.PI / 2;
  flash.visible = false;
  muzzle.add(flash);
  return { model, muzzle, flash, sight, magazine, supportHand };
}
