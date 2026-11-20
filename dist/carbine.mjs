import * as THREE from './vendor/three.module.js';
import { DEFAULT_WEAPON_LOADOUT, normalizeWeaponLoadout } from './weapon-mods.mjs';

export const FINISH_COLORS = {
  factory: { shell: 0xbeb6a3, steel: 0x7d8588, receiver: 0x383d41, trim: 0xa4a9a5 },
  obsidian: { shell: 0x343836, steel: 0x61646a, receiver: 0x252628, trim: 0x96908a },
  arctic: { shell: 0xe3e7dc, steel: 0x8daab6, receiver: 0x3b505c, trim: 0xb9cdd0 },
  crimson: { shell: 0xa33a31, steel: 0x886f60, receiver: 0x472529, trim: 0xc09a69 },
  moss: { shell: 0x5d6951, steel: 0x767f72, receiver: 0x313931, trim: 0xaaa88f },
  desert: { shell: 0xd3aa75, steel: 0x8d7d69, receiver: 0x4d4033, trim: 0xc3aa8d },
};

export const ACCENT_COLORS = {
  factory: { cell: 0x4c9a60, emitter: 0x4ebf74, glass: 0x548d76, cover: 0x579879 },
  amber: { cell: 0xbf802e, emitter: 0xf7b548, glass: 0xa97843, cover: 0xbc8f55 },
  violet: { cell: 0x9363be, emitter: 0xc38ef0, glass: 0x83639f, cover: 0x9272ae },
  ice: { cell: 0x58a3bc, emitter: 0x6dd9ec, glass: 0x6899ae, cover: 0x6aa7bd },
};

export function finishTexture(kind) {
  const size = 192;
  const pixels = new Uint8Array(size * size * 4);
  const grain = new Float32Array(size);
  let state = 8971 + kind.length;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = 0; i < size; i++) grain[i] = random() - .5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const noise = (random() - .5) * 13;
      const stain = Math.sin(x * .077 + y * .083) * Math.cos(y * .057 - x * .096);
      let value = 224 + noise + stain * 7;
      if (kind === 'steel') value += (grain[y] * 14 + grain[(y + 1) % size] * 3) * (.73 + random() * .27);
      if (kind === 'polymer') value += Math.sin(x * .219 - y * .39) * Math.sin(y * .375 + x * .46) * 6;
      if (kind === 'fabric') {
        const warp = Math.cos((x + y) * Math.PI / 4);
        const weft = Math.cos((x - y) * Math.PI / 4);
        value += (warp * weft + (warp + weft) * .18) * 13;
      }
      const index = (y * size + x) * 4;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  if (kind !== 'fabric') {
    for (let scratch = 0; scratch < 31; scratch++) {
      const x = Math.floor(random() * size);
      const y = Math.floor(random() * size);
      const length = 4 + Math.floor(random() * (kind === 'steel' ? 43 : 15));
      const slope = (random() - .5) * (kind === 'steel' ? .22 : 1.8);
      for (let offset = 0; offset < length; offset++) {
        const row = (y + Math.round(offset * slope) + size) % size;
        const index = (row * size + (x + offset) % size) * 4;
        const depth = Math.sin(Math.PI * offset / length) * 19;
        for (let channel = 0; channel < 3; channel++) pixels[index + channel] -= depth;
      }
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(kind === 'fabric' ? 1.5 : 4, kind === 'fabric' ? 1.5 : 4);
  texture.needsUpdate = true;
  return texture;
}

export function createCarbine({ showHands = true } = {}) {
  const model = new THREE.Group();
  const brushed = finishTexture('steel');
  const molded = finishTexture('polymer');
  const woven = finishTexture('fabric');
  const metal = new THREE.MeshPhysicalMaterial({
    color: 0x7d8588, metalness: .79, roughness: .45, map: brushed, roughnessMap: brushed,
    bumpMap: brushed, bumpScale: .0016, clearcoat: .09, clearcoatRoughness: .50,
  });
  const dark = new THREE.MeshPhysicalMaterial({
    color: 0x383d41, metalness: .61, roughness: .46, map: brushed,
    bumpMap: brushed, bumpScale: .00115, clearcoat: .10, clearcoatRoughness: .49,
  });
  const edge = new THREE.MeshStandardMaterial({ color: 0xa4a9a5, metalness: .9, roughness: .28, map: brushed });
  const ivory = new THREE.MeshStandardMaterial({
    color: 0xbeb6a3, metalness: .18, roughness: .52,
    map: molded, roughnessMap: molded, bumpMap: molded, bumpScale: .0027,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: .82, map: molded });
  const fabric = new THREE.MeshStandardMaterial({
    color: 0x292b2c, roughness: .92, map: woven, bumpMap: woven, bumpScale: .0016,
  });
  const leather = new THREE.MeshPhysicalMaterial({
    color: 0x303131, roughness: .64, map: molded, bumpMap: molded, bumpScale: .0023,
    clearcoat: .18, clearcoatRoughness: .73,
  });
  const green = new THREE.MeshStandardMaterial({ color: 0x4c9a60, emissive: 0x4ebf74, emissiveIntensity: 1.08, metalness: .33, roughness: .22 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x548d76, transparent: true, opacity: .26, metalness: .18, roughness: .13, clearcoat: 1, depthWrite: false });
  const cellGlass = new THREE.MeshPhysicalMaterial({
    color: 0x579879, metalness: .11, roughness: .18, transparent: true, opacity: .44,
    clearcoat: .75, depthWrite: false,
  });

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

  function sidePlate(points, thickness, material, x, cutouts = [], parent = model) {
    const shape = contour(new THREE.Shape(), points);
    for (const cutout of cutouts) shape.holes.push(contour(new THREE.Path(), cutout));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness, bevelEnabled: true, bevelThickness: .002, bevelSize: .002, bevelSegments: 2,
    });
    const part = mesh(geometry, material, x, 0, 0, parent);
    part.rotation.y = -Math.PI / 2;
    return part;
  }

  panel(.143,.107,.52,.013,dark,0,0,-.17);
  panel(.155,.11,.29,.012,metal,0,.02,-.045);
  panel(.141,.078,.24,.013,dark,0,-.035,.207);
  panel(.149,.117,.047,.016,rubber,0,-.059,.326).rotation.x = -.12;
  panel(.16,.066,.29,.013,ivory,0,.023,.115);
  panel(.113,.027,.18,.008,dark,0,.058,.16);
  panel(.094,.015,.144,.005,rubber,0,.071,.169);
  for (let i = 0; i < 6; i++) panel(.088,.003,.004,.001,metal,0,.078,.111 + i * .022);
  panel(.104,.077,.266,.011,dark,0,-.012,-.399);
  const slotParts = { barrel: {}, muzzle: {}, optic: {}, receiver: {}, magazine: {} };
  const barrelSockets = { standard: -.707, 'heavy-barrel': -.797, 'short-barrel': -.612 };
  const muzzleTips = { standard: -.080, compensator: -.076, 'flash-hider': -.089 };

  function attachment(slot, id, parent = model) {
    const group = new THREE.Group();
    group.name = slot + ':' + id;
    group.visible = id === 'standard';
    parent.add(group);
    slotParts[slot][id] = group;
    return group;
  }

  const factoryBarrel = attachment('barrel', 'standard');
  tube(.023,.336,metal,0,.025,-.539,factoryBarrel);
  const muzzleMount = new THREE.Group();
  muzzleMount.position.z = barrelSockets.standard;
  model.add(muzzleMount);
  const factoryMuzzle = attachment('muzzle', 'standard', muzzleMount);
  const crown = new THREE.LatheGeometry([
    [.017,-.079],[.032,-.079],[.036,-.072],[.036,-.049],[.031,-.042],
    [.031,-.008],[.037,.002],[.037,.031],[.029,.044],[.021,.044],[.017,-.079],
  ].map(([radius,z]) => new THREE.Vector2(radius,z)),32);
  mesh(crown,metal,0,.025,0,factoryMuzzle).rotation.x = Math.PI / 2;
  const aperture = mesh(new THREE.TorusGeometry(.024,.0025,6,28),dark,0,.025,-.080,factoryMuzzle);
  aperture.scale.z = .6;
  for (let i = 0; i < 4; i++) tube(.032,.004,dark,0,.025,-.020+i*.009,factoryMuzzle);

  const ventCutouts = [];
  for (let i = 0; i < 5; i++) {
    const z = -.516 + i * .043;
    ventCutouts.push([[z,.016],[z+.025,.016],[z+.030,.038],[z+.006,.038]]);
  }
  const bolt = new THREE.Group();
  model.add(bolt);
  panel(.119,.036,.12,.004,dark,.015,.055,-.052,bolt);
  panel(.079,.016,.087,.003,metal,.009,.075,-.048,bolt);
  panel(.020,.016,.041,.004,edge,-.065,.057,-.069,bolt);
  panel(.013,.019,.019,.003,dark,-.080,.056,-.069,bolt);

  const screw = new THREE.CylinderGeometry(.010,.010,.009,12);
  const factoryReceiver = attachment('receiver', 'standard');
  for (const sign of [-1,1]) {
    sidePlate([[-.097, -.011], [-.047, -.027], [.098, -.027], [.142, -.006], [.124, .04], [-.077, .046]],
      .01, ivory, sign < 0 ? -.078 : .088, [], factoryReceiver);
    sidePlate([[-.557,-.043],[-.541,.044],[-.511,.058],[-.298,.055],[-.26,.026],[-.284,-.045]],
      .012,metal,sign < 0 ? -.065 : .077,ventCutouts);
    sidePlate([[-.536,-.042],[-.5,-.062],[-.329,-.06],[-.303,-.04]],
      .009,ivory,sign < 0 ? -.069 : .078);
    panel(.014,.045,.19,.005,dark,.073*sign,-.009,-.226);
    tube(.011,.144,cellGlass,.091*sign,-.002,-.222);
    tube(.006,.138,green,.091*sign,-.002,-.222);
    for (const z of [-.288,-.263,-.178,-.154]) tube(.014,.009,metal,.091*sign,-.002,z);
    for(const z of [-.32,-.145,.102]) {
      const fastener=mesh(screw,edge,.094*sign,.032,z);
      fastener.rotation.z = Math.PI / 2;
      panel(.002,.002,.011,.0004,dark,.100 * sign,.032,z);
    }
    for (let i = 0; i < 3; i++) panel(.006,.004,.014,.001,green,.093*sign,.035,.032+i*.019);
    panel(.012,.012,.073,.002,dark,.093*sign,.019,.06);
    panel(.014,.011,.022,.002,metal,.1*sign,.021,.084);
  }

  panel(.079,.020,.48,.004,dark,0,.073,-.254);
  for (let i = 0; i < 15; i++) panel(.086,.012,.014,.0028,metal,0,.086,-.504+i*.024);
  const factorySight = attachment('optic', 'standard');
  panel(.104,.024,.112,.006,dark,0,.102,-.115,factorySight);
  const optic = contour(new THREE.Shape(), [
    [-.051,-.034],[.051,-.034],[.053,.015],[.039,.035],[-.039,.035],[-.053,.015],
  ]);
  optic.holes.push(contour(new THREE.Path(), [
    [-.035,-.02],[-.037,.011],[-.027,.022],[.027,.022],[.037,.011],[.035,-.02],
  ]));
  const opticHousing = new THREE.ExtrudeGeometry(optic, {
    depth: .055, bevelEnabled: true, bevelThickness: .006, bevelSize: .005, bevelSegments: 3,
  });
  mesh(opticHousing, metal, 0, .142, -.153,factorySight);
  panel(.071,.038,.004,.0015,glass,0,.142,-.143,factorySight);
  mesh(new THREE.SphereGeometry(.0029,12,8),green,0,.142,-.137,factorySight);
  for (const x of [-.045, .045]) {
    tube(.0054,.003,edge,x,.125,-.091,factorySight);
    tube(.0054,.003,edge,x,.154,-.091,factorySight);
  }
  const adjuster = mesh(new THREE.CylinderGeometry(.012,.012,.016,18),dark,.056,.144,-.124,factorySight);
  adjuster.rotation.z = Math.PI / 2;
  const sight = new THREE.Object3D();
  sight.position.set(0,.142,-.115);
  model.add(sight);

  function bore(radius, y, z, parent) {
    const rim = mesh(new THREE.TorusGeometry(radius, .004, 10, 32), edge, 0, y, z, parent);
    const inner = mesh(new THREE.CircleGeometry(radius - .001, 32), rubber, 0, y, z + .003, parent);
    inner.rotation.y = Math.PI;
    return rim;
  }

  const heavyBarrel = attachment('barrel', 'heavy-barrel');
  tube(.031,.269,metal,0,.025,-.662,heavyBarrel);
  tube(.043,.049,dark,0,.025,-.608,heavyBarrel);
  for (let i = 0; i < 4; i++) tube(.038,.006,edge,0,.025,-.653+i*.014,heavyBarrel);
  panel(.084,.067,.094,.011,dark,0,.025,-.716,heavyBarrel);
  tube(.034,.027,metal,0,.025,-.783,heavyBarrel);
  for (const x of [-.045, .045]) {
    for (let i = 0; i < 3; i++) {
      panel(.004,.023,.020,.0014,rubber,x*.94,.036,-.688-i*.024,heavyBarrel).rotation.x = -.14;
      panel(.004,.004,.019,.0011,edge,x*.94,.049,-.688-i*.024,heavyBarrel);
    }
  }

  const shortBarrel = attachment('barrel', 'short-barrel');
  tube(.022,.261,metal,0,.025,-.482,shortBarrel);
  tube(.031,.053,dark,0,.025,-.577,shortBarrel);
  for (const z of [-.559,-.575,-.591]) tube(.032,.004,edge,0,.025,z,shortBarrel);

  const compensator = attachment('muzzle', 'compensator', muzzleMount);
  tube(.032,.038,metal,0,.025,.006,compensator);
  panel(.097,.068,.089,.009,metal,0,.026,-.029,compensator);
  panel(.075,.016,.052,.003,dark,0,.061,-.030,compensator);
  for (let i = 0; i < 3; i++) {
    panel(.051,.003,.008,.0007,rubber,0,.070,-.011-i*.019,compensator);
  }
  for (const x of [-.049, .049]) {
    panel(.004,.023,.051,.0018,dark,x,.026,-.028,compensator);
    panel(.005,.006,.025,.0013,ivory,x,.043,-.023,compensator);
  }
  bore(.018,.025,-.075,compensator);

  const flashHider = attachment('muzzle', 'flash-hider', muzzleMount);
  tube(.034,.037,dark,0,.025,.002,flashHider);
  tube(.041,.013,metal,0,.025,-.021,flashHider);
  bore(.018,.025,-.029,flashHider);
  for (let i = 0; i < 4; i++) {
    const angle = (i+.5)*Math.PI/2;
    const x = Math.cos(angle)*.033;
    const y = .025+Math.sin(angle)*.033;
    const prong = panel(.026,.017,.071,.004,metal,x,y,-.053,flashHider);
    prong.rotation.z = angle-Math.PI/2;
    const band = panel(.022,.019,.010,.003,edge,x,y,-.072,flashHider);
    band.rotation.z = prong.rotation.z;
  }

  const marksmanOptic = attachment('optic', 'marksman-optic');
  panel(.089,.020,.186,.005,dark,0,.101,-.140,marksmanOptic);
  const opticY = sight.position.y;
  const scopeGeometry = new THREE.LatheGeometry([
    [.023,-.096],[.036,-.096],[.041,-.085],[.040,-.066],[.028,-.050],
    [.029,.038],[.037,.052],[.037,.081],[.026,.083],[.024,.073],[.023,-.096],
  ].map(point => new THREE.Vector2(...point)), 36);
  mesh(scopeGeometry, metal, 0, opticY, -.126, marksmanOptic).rotation.x = Math.PI / 2;
  for (const z of [-.203,-.198,-.063,-.057]) {
    mesh(new THREE.TorusGeometry(z < -.1 ? .041 : .037,.0018,8,32),edge,0,opticY,z,marksmanOptic);
  }
  mesh(new THREE.CircleGeometry(.027,32),glass,0,opticY,-.053,marksmanOptic);
  mesh(new THREE.SphereGeometry(.0025,12,8),green,0,opticY,-.048,marksmanOptic);
  mesh(new THREE.CylinderGeometry(.014,.017,.016,18),dark,0,.183,-.126,marksmanOptic);
  const scopeDial = mesh(new THREE.CylinderGeometry(.012,.015,.014,18),edge,.031,.145,-.126,marksmanOptic);
  scopeDial.rotation.z = Math.PI / 2;

  const reflexSight = attachment('optic', 'reflex-sight');
  panel(.091,.025,.083,.005,dark,0,.101,-.118,reflexSight);
  const hood = contour(new THREE.Shape(), [
    [-.044,-.029],[.044,-.029],[.047,.020],[.030,.033],[-.030,.033],[-.047,.020],
  ]);
  hood.holes.push(contour(new THREE.Path(), [
    [-.036,-.016],[-.038,.014],[-.023,.024],[.023,.024],[.038,.014],[.036,-.016],
  ]));
  mesh(new THREE.ExtrudeGeometry(hood, {
    depth: .016, bevelEnabled: true, bevelThickness: .003, bevelSize: .003, bevelSegments: 2,
  }),ivory,0,opticY,-.134,reflexSight);
  panel(.071,.035,.003,.001,glass,0,opticY,-.123,reflexSight);
  mesh(new THREE.SphereGeometry(.0025,12,8),green,0,opticY,-.117,reflexSight);
  for (const x of [-.04,.04]) tube(.006,.010,edge,x,.114,-.104,reflexSight);

  const rapidReceiver = attachment('receiver', 'rapid-receiver');
  panel(.166,.032,.189,.007,dark,0,.061,-.033,rapidReceiver);
  for (const side of [-1,1]) {
    panel(.027,.071,.182,.007,ivory,side*.081,.028,-.035,rapidReceiver);
    for (let i = 0; i < 4; i++) {
      const louver = panel(.007,.040,.011,.0022,dark,side*.096,.030,-.083+i*.025,rapidReceiver);
      louver.rotation.x = -.36;
    }
    panel(.008,.009,.044,.0017,green,side*.097,.053,.021,rapidReceiver);
    for (const x of [-.075,-.048,-.021]) {
      panel(.007,.004,.013,.0011,edge,side*.100,-.003,x,rapidReceiver);
    }
  }

  const precisionReceiver = attachment('receiver', 'precision-receiver');
  for (const side of [-1,1]) {
    panel(.023,.061,.179,.006,dark,side*.082,.025,-.037,precisionReceiver);
    panel(.008,.025,.138,.004,metal,side*.097,.027,-.038,precisionReceiver);
    panel(.006,.007,.066,.002,edge,side*.102,.042,-.045,precisionReceiver);
    for (const z of [-.103,.028]) {
      const screwHead = mesh(screw,edge,side*.101,.027,z,precisionReceiver);
      screwHead.rotation.z = Math.PI/2;
    }
    panel(.006,.008,.028,.0018,green,side*.102,.016,-.016,precisionReceiver);
  }

  const magazine = new THREE.Group();
  magazine.position.set(0,-.085,-.235);
  model.add(magazine);
  const factoryMagazine = attachment('magazine', 'standard', magazine);
  panel(.083,.145,.127,.009,dark,0,-.06,0,factoryMagazine).rotation.x=.16;
  panel(.09,.026,.139,.006,metal,0,-.132,-.013,factoryMagazine);
  for(let i=0;i<5;i++) panel(.087,.009,.090,.003,metal,0,-.027-i*.02,-.008,factoryMagazine);

  const extendedMagazine = attachment('magazine', 'extended-magazine', magazine);
  sidePlate([
    [-.066,.012],[.063,.012],[.062,-.068],[.044,-.131],[.014,-.197],
    [-.106,-.161],[-.087,-.107],[-.074,-.049],
  ],.083,dark,-.0415,[],extendedMagazine);
  const extendedBase = panel(.092,.024,.130,.006,metal,0,-.181,-.045,extendedMagazine);
  extendedBase.rotation.x = .29;
  for (const x of [-.043,.043]) {
    panel(.005,.162,.019,.002,metal,x,-.074,-.040,extendedMagazine).rotation.x = .24;
    panel(.005,.159,.014,.002,edge,x,-.087,.002,extendedMagazine).rotation.x = .24;
    panel(.006,.038,.006,.0013,green,x,-.059,.023,extendedMagazine);
  }

  const quickMagazine = attachment('magazine', 'quick-magazine', magazine);
  panel(.079,.089,.124,.009,dark,0,-.035,-.004,quickMagazine).rotation.x = .11;
  panel(.092,.024,.138,.006,ivory,0,-.084,-.013,quickMagazine);
  for (const x of [-.043,.043]) {
    panel(.007,.043,.073,.002,metal,x,-.037,-.014,quickMagazine);
    panel(.009,.014,.014,.003,rubber,x,-.099,-.033,quickMagazine).rotation.x = .22;
  }
  panel(.088,.011,.012,.003,rubber,0,-.108,-.035,quickMagazine);
  model.updateMatrixWorld(true);
  const magazineGrips = {};
  for (const [id, group] of Object.entries(slotParts.magazine)) {
    const bounds = new THREE.Box3().setFromObject(group);
    const grip = bounds.getCenter(new THREE.Vector3()).sub(magazine.position);
    grip.x = bounds.min.x - magazine.position.x + .007;
    grip.z -= .019;
    magazineGrips[id] = grip;
  }
  const magazineGrip = magazineGrips.standard.clone();

  panel(.082,.132,.092,.013,dark,0,-.088,.047).rotation.x=-.32;
  panel(.034,.016,.114,.004,metal,0,-.123,-.057);
  panel(.034,.047,.015,.004,metal,0,-.106,-.112);
  const trigger = panel(.015,.046,.012,.003,metal,0,-.082,-.02);
  trigger.rotation.x = .3;

  // Everything added so far is the carbine itself; the gloves, sleeves and muzzle follow.
  const bodyParts = [...model.children];

  const gloveGeometry = new THREE.SphereGeometry(1,22,16);
  const up = new THREE.Vector3(0,1,0);
  const direction = new THREE.Vector3();
  const wrist = new THREE.Vector3();

  function glovePad(parent, position, scale, material) {
    const pad = mesh(gloveGeometry,material,...position,parent);
    pad.scale.set(...scale);
    return pad;
  }

  function finger(hand, origin, joints, radius) {
    const group = new THREE.Group();
    group.position.set(...origin);
    hand.add(group);
    const path = [[0,0,0], ...joints].map(point => new THREE.Vector3(...point));
    for (let index = 1; index < path.length; index++) {
      const start = path[index - 1];
      const end = path[index];
      const width = radius * (1 - (index - 1) * .11);
      direction.subVectors(end,start);
      const center = start.clone().lerp(end,.5);
      const segment = mesh(new THREE.CapsuleGeometry(width, Math.max(.001,direction.length() - width),5,12),
        index === 1 ? fabric : leather,center.x,center.y,center.z,group);
      segment.quaternion.setFromUnitVectors(up,direction.normalize());
    }
    return group;
  }

  function sleeve(shoulder, hand, wristOffset) {
    const cuff = new THREE.Group();
    const origin = new THREE.Vector3(...shoulder);
    const offset = new THREE.Vector3(...wristOffset);
    mesh(new THREE.CylinderGeometry(.044,.072,1,20,1),fabric,0,0,0,cuff);
    mesh(new THREE.CylinderGeometry(.048,.054,.11,20,1),rubber,0,.449,0,cuff);
    panel(.072,.34,.030,.009,dark,-.031,.091,.013,cuff).rotation.y = .36;
    panel(.039,.19,.023,.007,metal,-.048,.14,.022,cuff).rotation.y = .36;
    model.add(cuff);
    cuff.visible = showHands;
    return () => {
      wrist.copy(offset).applyQuaternion(hand.quaternion).add(hand.position);
      direction.subVectors(wrist,origin);
      cuff.position.copy(origin).lerp(wrist,.5);
      cuff.scale.y = direction.length();
      cuff.quaternion.setFromUnitVectors(up,direction.normalize());
    };
  }

  const supportHand = new THREE.Group();
  supportHand.visible = showHands;
  supportHand.position.set(-.075,-.074,-.378);
  model.add(supportHand);
  glovePad(supportHand,[-.024,-.021,.038],[.035,.043,.069],fabric).rotation.x = .26;
  glovePad(supportHand,[-.05,-.009,.043],[.012,.027,.048],leather).rotation.x = .2;
  const supportingFingers = [];
  for (let i = 0; i < 4; i++) {
    const z = -.04 + i * .023;
    const rise = .035 - Math.abs(i - 1.5) * .003;
    supportingFingers.push(finger(supportHand,[-.046,.004,z],
      [[.005,rise * .63,-.004],[.026,rise,-.009],[.044,rise * .77,-.007]],.0104));
    glovePad(supportHand,[-.047,.017,z],[.010,.014,.012],leather);
  }
  finger(supportHand,[-.043,-.004,.080],[[.004,.020,.008],[.017,.041,.003],[.024,.043,-.012]],.013);
  const updateSupportSleeve = sleeve([-.29,-.35,.23],supportHand,[-.022,-.046,.090]);

  const gripHand = new THREE.Group();
  gripHand.visible = showHands;
  gripHand.position.set(.038,-.114,.075);
  model.add(gripHand);
  glovePad(gripHand,[.008,-.032,.017],[.040,.058,.058],fabric).rotation.x = .37;
  glovePad(gripHand,[-.023,-.045,.035],[.019,.041,.039],leather).rotation.x = .43;
  for (let i = 0; i < 3; i++) {
    finger(gripHand,[.015,-.030-i*.021,-.019+i*.005],
      [[-.007,-.001,-.036],[-.028,.005,-.047],[-.054,.009,-.036]],.011);
  }
  const indexFinger = finger(gripHand,[.004,.004,-.015],
    [[-.019,.014,-.057],[-.039,.013,-.094],[-.049,.019,-.088]],.0097);
  finger(gripHand,[.030,-.004,.029],[[.017,.022,-.010],[.013,.035,-.043],[-.011,.038,-.053]],.012);
  const updateGripSleeve = sleeve([.19,-.39,.49],gripHand,[.010,-.067,.061]);

  function poseHands(reach, recoil) {
    for (const gloveFinger of supportingFingers) gloveFinger.rotation.z = -.22 * Math.sin(reach * Math.PI);
    trigger.rotation.x = .3 + recoil * .19;
    indexFinger.rotation.x = -recoil * .11;
    updateSupportSleeve();
  }

  updateGripSleeve();
  poseHands(0,0);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0,.025,barrelSockets.standard+muzzleTips.standard);
  model.add(muzzle);
  const flash = new THREE.Group();
  const blast = new THREE.MeshBasicMaterial({ color: 0xffe5a2, transparent: true, opacity: .88, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
  const cone = mesh(new THREE.ConeGeometry(.057,.28,6),blast,0,0,-.14,flash);
  cone.rotation.x = -Math.PI / 2;
  flash.visible = false;
  muzzle.add(flash);

  let currentLoadout = DEFAULT_WEAPON_LOADOUT;

  function setLoadout(loadout = DEFAULT_WEAPON_LOADOUT) {
    const next = normalizeWeaponLoadout(loadout);
    for (const [slot, variants] of Object.entries(slotParts)) {
      if (next[slot] === currentLoadout[slot]) continue;
      const previous = variants[currentLoadout[slot]];
      const active = variants[next[slot]];
      if (previous) previous.visible = false;
      if (active) active.visible = true;
    }
    if (next.barrel !== currentLoadout.barrel || next.muzzle !== currentLoadout.muzzle) {
      muzzleMount.position.z = barrelSockets[next.barrel];
      muzzle.position.z = muzzleMount.position.z+muzzleTips[next.muzzle];
    }
    if (next.magazine !== currentLoadout.magazine) magazineGrip.copy(magazineGrips[next.magazine]);
    if (next.finish !== currentLoadout.finish) {
      const palette = FINISH_COLORS[next.finish];
      ivory.color.setHex(palette.shell);
      metal.color.setHex(palette.steel);
      dark.color.setHex(palette.receiver);
      edge.color.setHex(palette.trim);
    }
    if (next.accent !== currentLoadout.accent) {
      const accent = ACCENT_COLORS[next.accent];
      green.color.setHex(accent.cell);
      green.emissive.setHex(accent.emitter);
      glass.color.setHex(accent.glass);
      cellGlass.color.setHex(accent.cover);
    }
    currentLoadout = next;
  }

  // Other weapons reuse the gloves and muzzle flash and hide the carbine body.
  function setBodyVisible(visible) {
    for (const part of bodyParts) part.visible = visible && !part.userData.replaced && (!part.name || slotVisible(part));
  }

  // Swaps the procedural body and bolt for modelled ones; slot parts, sights and gloves stay.
  function replaceBody(modelled, modelledBolt) {
    for (const part of bodyParts) {
      if (!part.isMesh) continue;
      part.visible = false;
      part.userData.replaced = true;
    }
    model.add(modelled);
    bodyParts.push(modelled);
    if (modelledBolt) {
      for (const part of bolt.children) part.visible = false;
      bolt.add(modelledBolt);
    }
  }

  function slotVisible(part) {
    const [slot, id] = part.name.split(':');
    return !Object.hasOwn(slotParts, slot) || currentLoadout[slot] === id;
  }

  return {
    model, muzzle, flash, sight, magazine, magazineGrip, supportHand, gripHand, bolt, poseHands, setLoadout, setBodyVisible,
    replaceBody, shell: ivory,
    materials: { shell: ivory, steel: metal, dark, edge, rubber, accent: green, glass, cellGlass },
  };
}
