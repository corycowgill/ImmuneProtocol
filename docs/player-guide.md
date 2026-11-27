# Immune Protocol player guide

Everything you need to play: modes, missions, bosses, weapons, controls, co-op and settings. For building, testing and asset pipelines, see the [development guide](development.md).

- [Getting started](#getting-started)
- [Modes and progression](#modes-and-progression)
- [How a mission plays](#how-a-mission-plays)
- [Campaign missions](#campaign-missions)
- [Bosses](#bosses)
- [Checkpoints](#checkpoints)
- [Difficulty](#difficulty)
- [Weapons and the Armory](#weapons-and-the-armory)
- [Nano companions: turret or medic drone](#nano-companions-turret-or-medic-drone)
- [The tissue sealer](#the-tissue-sealer)
- [Controls](#controls)
- [Suit abilities](#suit-abilities)
- [Organ hazards and raised ground](#organ-hazards-and-raised-ground)
- [Pathogens and the disease guide](#pathogens-and-the-disease-guide)
- [Achievements](#achievements)
- [Operator profiles](#operator-profiles)
- [Online co-op](#online-co-op)
- [Settings](#settings)
- [Language](#language)
- [Ending, credits and music](#ending-credits-and-music)

## Getting started

[Play on GitHub Pages](https://corycowgill.github.io/ImmuneProtocol/), or [play online co-op](https://immune-protocol-coop.onrender.com/). You need a browser that supports WebGL 2. The game runs on desktop with keyboard and mouse or an Xbox controller, and on phones and tablets with touch controls.

**Install it as an app.** On a phone or tablet, add the game to your home screen: in Safari on iPhone or iPad tap Share, then **Add to Home Screen**; in Chrome on Android tap the menu, then **Install app** (or **Add to Home screen**). It then opens full screen in landscape, without the browser's bars, and keeps what it has loaded so later launches are faster and the campaign plays offline. Story videos and online co-op still need a connection. Desktop Chrome and Edge offer the same through the install icon in the address bar.

The game opens with an illustrated lab loading screen while it prepares weapons, pathogens, suits and arenas; its progress bar shows how far along it is, with rotating dispatches from the lab. The Hallucinated Games studio intro plays over it before the main menu. Use Skip intro, press Escape, or open the game with `?nointro` to go straight to the menu. Skipping the intro still waits for preparation to finish. If a required model or artwork fails to load, the game shows a retry screen rather than letting you deploy with missing assets. Each deployment, restart and mission transition has its own short loading screen too.

Your first Arterial Junction deployment begins with one guided breach. Shoot the bacillus off the tissue, move into repair range, and hold Repair until the wound seals. The second node and turret become available as the rest of Wave 1 begins. Training uses the stock carbine until the breach is sealed. The browser remembers completed training for later deployments.

The first time each move would help, a short hint shows the key for it: dash when a pathogen first winds up at you, jump next to raised ground, raised ground when an acid flood, contraction or squeeze is coming, bash when a pathogen latches nearby, a grenade into a crowd, a stun charge when a node is swarmed, and dragging the turret. Each appears once. Turn them off with **Settings > Controls > Ability hints**; **Reset to defaults** shows them all again.

## Modes and progression

The title screen lists every mode in one menu and an operator card that shows your campaign route, best score, difficulty and equipped weapons.

**Campaign.** Choose **Start campaign** (or **Continue campaign**) to open the deployment briefing: the mission route with secured and locked missions, the arena, its waves, tissue nodes and hazard, the pathogens you will face, and your difficulty, field upgrade and loadout, with a shortcut to the Armory. Select **Begin campaign** to deploy. Between missions, equip one field upgrade. Your browser saves completed missions and the chosen upgrade at each checkpoint. **Continue campaign** shows the next mission and takes you back to its start. The final report shows the tissue preserved in all ten missions, total score, and pathogens neutralized.

You can start any mission you have reached, not only the next one: pick it in the deployment screen. Replaying an earlier mission keeps your results before it and replaces the later ones as you play on; starting a mission you reached in an earlier campaign records the missions you skipped with no score.

| Field upgrade | Effect |
| --- | --- |
| Fast Sealer | Restores 18 tissue points per repair pulse. |
| Deep Magazine | Adds 12 rounds to the equipped magazine. |
| Insulated Suit | Reduces suit damage from stomach acid, intestinal pressure waves, and haustral squeezes by 40%. |
| Turret Stabilizer | Extends the turret's slow from 1.4 to 2.2 seconds. |

**Free Mode** opens the same deployment briefing with every mission available. Select a mission, set difficulty, field upgrade and loadout, then select **Deploy**. Free Mode runs leave your campaign checkpoint, mission progression, and best score intact.

**Endless** holds one arena against waves that never stop. Choose **Endless** on the title screen, pick an arena, set difficulty, field upgrade and loadout, then deploy. Every wave is harder than the last:

- **More pathogens.** Each wave is built from the arena's own waves, with 12% more of the roster added every wave, and always more pathogens than the wave before. Arterial Junction opens with 45 and fields about 200 by wave 10 and nearly 500 by wave 30.
- **Faster arrivals.** Pathogens arrive about 3.5% sooner each wave, down to twice the authored rate by wave 20.
- **Tougher pathogens.** Each wave adds 5% health (+45% by wave 10) and 3% damage to tissue and your suit (+27% by wave 10).
- **Bosses.** The arena's boss joins every fifth wave once its roster has arrived, and comes back with 25% more health each time.

At most 80 pathogens are on the field at once; the rest wait at their inlets and count toward the threats left. Brood nests and antibody caches appear as usual, and clearing a wave restores some suit integrity. There are no wave checkpoints: the run ends when a tissue node or your suit fails, and the report shows how many waves you cleared. Your best run in each arena (most waves, then score) is saved for your operator and shown on the Endless deployment screen.

Endless is available in the six arenas built from plain waves: Arterial Junction, Bronchial Fork, Intestinal Bend, Colonic Reservoir, Lymph Node and Inner Ear. Capillary Junction, Heart Valve, Gastric Chamber and Neural Cortex keep their scripted objectives and are not offered. Endless runs leave your campaign progress and best score untouched.

**Practice Mega Virus.** Reaching the Mega Virus in Neural Cortex in either mode unlocks this option, which starts directly at Wave 3 with fresh supplies.

**Online co-op** is covered [below](#online-co-op).

## How a mission plays

Each mission asks you to defend two or three tissue nodes. Each node has its own integrity meter and direction marker, and losing any node ends the mission. Tissue nodes are solid cover for pathogens too: your shots stop at a node, so a pathogen on its far side needs a clear line around it. A suit standing in a node to repair it can still fire outward.

**The swarm.** Every wave fields five times the pathogens it was first written with, arriving close together, so the arena fills up and the fight should feel close to overrun. More pathogens commit to attacks at once (up to four on Easy, six on Medium and seven on Hard), and each strike from an ordinary pathogen does less damage, so a swarm is survivable when you fight it and lethal when you ignore it. Bosses keep their own damage. On Medium, the Intestinal Bend and Colonic Reservoir send their waves a little more slowly. Your score and kills are shown in the top right during a mission.

**Reading the swarm.** Ordinary waves mix **Swarm Pincers, Spore Crossfire, Colony Convoys, Decoy Rushes, Tissue Sieges and Predator Packs** using their existing enemies. Nothing on screen names an encounter, marks where it will enter or labels what a pathogen is doing: you read the swarm from the pathogens themselves, their windups and their sounds. Groups compress into short pushes with breathing room afterward. Fresh deployments vary the mix, while wave-checkpoint retries keep the same one.

Pathogens think for themselves. They see and hear you, remember where you were, route around obstacles and coordinate with nearby colony members. Lungers surround targets, spitters strafe and use cover, bacteria split their approaches to tissue, and armoured guards can protect wounded colony members. If you hide, they investigate your last known position.

**Brood nests.** Missions give you reasons to leave your node. From the second wave on (the first in two-wave missions), a brood nest takes root on the far side of the arena and hatches a fast larva every few seconds, up to eight; the last wave roots two. A wave is not clear until every nest is destroyed, and the player who destroys one scores 600.

**Antibody caches.** Partway through each wave a cache drifts in for 45 seconds: the first suit to reach it gets 40 suit integrity, a full magazine and 250 score.

Nests and caches are marked on screen, with an arrow at the screen edge when they are out of view. The training breach, Heart Valve, Capillary Junction and the Mega Virus keep their own scripted objectives instead.

**The arenas.** The playable floor is 110 × 154 m, with tissue nodes 40–60 m apart, and pathogens enter 20 m or more from the node they attack. The artery floor is broken up by ten clots that block movement and line of sight for you and force pathogens to flow around them. Tissue organs, villus groves, biofilm mounds and crystal clusters do the same in the organ arenas. When the last pathogen of a wave dies, a short countdown runs before the next wave, the Armory or the mission report, so you can see the area clear.

**Combat feedback.** Shots leave their mark. A round that misses lands where it would really strike the floor, the chamber wall or a clot and leaves a puncture wound in the tissue, with a flash of light, a puff of tissue mist and sparks (the Lancet also chips fragments loose). A pathogen you hit flashes, is knocked back along the shot and sprays its own fluid. Rockets scorch the ground where they burst. Marks fade after about half a minute. Your muzzle flash lights the tissue around you, and a hit on your own suit jolts the camera (not with reduced motion). Each species has its own death animation, debris and sound, from viruses that swell and rupture to drones that short out and blow apart.

**Pause.** The pause screen shows the wave, score, tissue and objective, and offers **Restart mission**, **Restart from wave N**, Settings, Achievements, the field manual, and **Quit to main menu**, which asks you to press it twice.

## Campaign missions

The campaign starts in the bloodstream, then moves through the lungs, stomach, small intestine, colon, a lymph node, the inner ear, and the brain. Every organ hazard raises a pulsing curtain around its zone during its warning.

| Mission | What to watch for |
| --- | --- |
| Arterial Junction | Learn to intercept attackers and repair the core before defending three nodes through five waves, under a river of red blood cells pumped through a beating valve. |
| Capillary Junction | Read the Amber and Teal attack forecasts, deploy support between waves, and choose whether to stay for Overtime. |
| Heart Valve | Four valves open in turn around a full-size chamber. Sprint between them, shoot the colonies through each opening and seal the four wounds while their valves are shut. |
| Bronchial Fork | Survive three waves, reopen both bronchi, and keep them open through a full breath. |
| Gastric Chamber | Close the intake and drain the acid basin under fire, then defend the newly exposed lower passage. |
| Intestinal Bend | Defend three nodes in a swaying villus forest and climb the villus terraces to ride out the pressure wave that sweeps the whole bend. |
| Colonic Reservoir | Hold three nodes in the microbiome while haustral squeezes sweep the chamber from side to side. |
| Lymph Node | A patrolling macrophage digests every pathogen it touches, and crushes suits. Lure infections into its path while you hold three nodes. |
| Inner Ear | Place your turret, or station your drone, outside the resonance zones to keep it working. Resonance rotates between three nodes. |
| Neural Cortex | Survive two waves, then fight the Mega Virus as its connected bodies take turns exposing their cores. |

### Capillary Junction

Capillary Junction has three waves with staggered attacks. The HUD names the next targeted node, the incoming pathogen, and the time until it enters. In Wave 3, an Amber virus rush arrives six seconds before the Teal bacillus breach.

During each break, use **1** to reinforce Amber, **2** to reinforce Teal, or **3** to start the next wave with a full magazine. You can also select the options on screen, or use the controller's D-pad: left reinforces Amber, right reinforces Teal, and up selects Load magazines. Reinforcement starts when the first attacker enters the chosen inlet.

In the breach wave, a bacillus tear can leave a gash that keeps draining tissue after the attacker dies. Move to the marked wound and hold Repair. Completed sealing pulses stay applied when you stop to fight or dodge. If a gash is still open after the last enemy falls, seal it to extract.

After securing Capillary Junction, choose **Extract** to bank the result or **Stay for overtime**. Both nodes, your remaining suit health and ammo, and your turret carry into overtime. Stop the Teal breach, clear the Amber spore pressure, and seal any gash to earn 2,000 bonus points. If you lose in overtime, retry Capillary Junction from Wave 1.

### Heart Valve

Four valves (Mitral, Tricuspid, Aortic and Pulmonary) sit at the edges of a full-size chamber, each with a tissue wound a few metres in front of its mouth and three spore colonies rooted on the floor behind it. The valves beat a quarter-cycle apart, so their open windows roll around the chamber: each opens for 3.6 s and shuts for 7.2 s. While a valve is open its colonies spit through the aperture at its wound, or at a suit standing in line with it, and each time it opens on living colonies it spews a spore out into the chamber. Shots, rockets and grenades only reach the colonies through an open aperture; the sleeve's muscle stops everything else. A wound can only be sealed while its own valve is shut. Flank patrols, Rogue Bots and Crawlers among them, come in from the four quarters between the valves. Four papillary muscles and two clots give cover on the long runs, so sprint and dash between valves. Each wound's marker says how long until its valve opens. The mission ends when every colony and flank threat is gone and all four wounds are restored.

### Bronchial Fork

Move to each blocked bronchus after the third wave and hold Repair to reopen it. Completed pulses carry over while you stop to fight. Once both bronchi are open, keep both tissue nodes at **45% integrity or higher** through one full breath. If integrity drops below 45%, that side clogs again. Watch the exhale timer when crossing the central airway, and clear any surviving pathogens before leaving.

### Gastric Chamber

Acid surges flood the entire chamber, so get onto one of the rugae islands during each warning and fight from island to island while it lasts. Clear the first wave, then hold Repair at the intake on the west bank. Closing it diverts acid into the drain channel. Cross to the east bank and hold Repair at the drain valve. Completed pulses carry over if you stop to fight. Once the basin empties, watch the lower passage behind the insertion point. The final wave uses it to flank both tissue nodes.

### Neural Cortex and the Mega Virus

The Mega Virus is Neural Cortex's third wave. Its connected membranes protect three cores. Follow the pulse to the core about to open, then shoot the exposed tissue. When the shell closes, clear spawned viruses, reload, and repair. Neural overload blocks repairs at the highlighted node during exposure. In the final phase, Shellbacks and Splitters pressure opposite sides.

**The Mega Nano Bot.** The Mega Virus is not the end. A few seconds after it collapses an alarm sounds and the **Mega Nano Bot** descends into the cortex: a hovering war machine the size of a house, with a human brain sealed in the glass dome on its back as its processor. It is untouchable while it descends, and the mission is won only when it falls.

- **Where to shoot.** Its health bar takes over from the Mega Virus's and always says what to do: *Shielded · shoot the 3 pylons*, then *Shield down · shoot the brain* with the seconds left. Markers sit on the pylons (cyan) and on the brain (pink) while each is the target, the shield flares when it turns a shot, and *Shielded · shoot the pylons* flashes under your crosshair if you are firing at the wrong thing.
- **Shield.** A shield bubble over its glass dome guards the brain, fed by beams from three cyan **pylons** that stand outside it on the rim of the hull; the armoured hull turns every shot meanwhile. Shoot the pylons; when the last one breaks the shield drops for twelve seconds and the machine reels for the first three. Now shoot the **brain** in the dome: it is the weak point (brain hits count for 125%), while the armoured hull turns 90% of every hit. When the window closes, or the machine reaches a new phase, the shield reboots with fresh, tougher pylons.
- **Missile salvo.** Marked circles appear on and around each suit and on the weakest node, and missiles land on them a second and a half later. Step out of the circles.
- **Laser sweep.** The belly cannon shows its aiming line, then sweeps a burning beam across the floor through where you stand. Jump it as it comes across, or put scenery between you and the machine.
- **Drone bay.** The bay drops open and launches Rogue Bots, and later Crawlers.
- **EMP.** A pulse knocks out every turret and medic drone near it for seven seconds and stings suits inside it. Keep your companion away from it, or expect to fight without it for a moment.

It has three phases (above two thirds of its health, above one third, and the rest), each attacking faster with bigger salvos and wider sweeps. When it falls its brain overloads and flickers out, the dome bursts, the thrusters cut out and it crashes into the cortex before its reactor blows. Clear any survivors after it falls.

## Bosses

Every mission ends with a boss. Once the final wave has sent its last pathogen the boss arrives, a health bar replaces the wave counter, and the wave cannot clear until it is dead. Killing one scores 2,500 for the suit that lands the last shot (the Mega Nano Bot, 5,000). Bosses have more health against a larger co-op squad.

| Mission | Boss | How it fights | How to beat it |
| --- | --- | --- | --- |
| Arterial Junction | Thrombus Titan | Armoured from every side (shots do 40%). Lines up a suit and charges in a straight line. | Sidestep so the charge carries it into the arena wall. It is stunned for about four seconds and takes 170% damage. |
| Capillary Junction | Capillary Leech | Latches onto a node, drains it and heals itself. | Deal 13% of its health while it is latched to knock it loose and stagger it; it then heads for the other node. |
| Heart Valve | Twelve colonies | Rooted on the floor behind the four valves, three each. | Shoot them while their valve is open. |
| Bronchial Fork | Mold Crown | Circles overhead out of melee reach, firing six-shot spore volleys at suits, lobbing at the weakest node and seeding spitters. | Keep moving under the volleys and shoot upward between them. |
| Gastric Chamber | Pylori Drill | Burrows where nothing can hit it, trailing a tremor, then erupts under a node or a suit. | Follow the tremor, get clear of the eruption, and punish it during the seven seconds it stays up. |
| Intestinal Bend | Tapeworm | A head leading seven segments on a circuit of the nodes, biting each as it passes. The head takes 8% damage while any segment survives and speeds up as they die. | Destroy every segment, then the exposed head. |
| Colonic Reservoir | Biofilm Colossus | Regrows health after five seconds without being hit, sheds brood at 75%, 50% and 25%, and slams suits within nine metres. | Keep someone firing at all times and back off when the slam warning shows. |
| Lymph Node | Rogue Macrophage | Drags a suit toward itself to engulf it, and eats any pathogen that touches it to heal. Its pull smears your visor; an engulf puts you inside its milky cytoplasm for a moment and leaves a heavy coat your suit wipes off once you are free. | Deal 5% of its health during the pull to break it and stagger it. Keep the swarm away from it. |
| Inner Ear | Otolith Screamer | Hovers and charges a sonic pulse that hits every suit it has a clear line to. Below half health it relocates and pulses faster. | Be behind an obstacle when the pulse fires. |
| Neural Cortex | Mega Virus | Three cores (see [above](#neural-cortex-and-the-mega-virus)). | Shoot the exposed core. |
| Neural Cortex | Mega Nano Bot | Arrives after the Mega Virus: a shielded war machine with missile salvos, a floor-sweeping laser, a drone bay and an EMP that downs turrets and drones (see [above](#neural-cortex-and-the-mega-virus)). | Break its three shield pylons, then shoot the brain in its dome while the shield is down. Leave the salvo circles and jump the laser. |

Boss attacks are read from the boss itself: its windup, glow and sound. The boss bar shows only its name and health, with no attack callouts, danger overlays or countdowns. Ground bosses route around terrain; clots can stop the Titan's charge, cover can break the Macrophage's pull, and the Screamer stays still during its pulse warning. While a boss is using a major attack, fewer minions attack at once. Half-health phases change the pressure but keep readable windups, and the Drill, Colossus and Screamer leave clear punish windows. The Heart colony warns before tearing, and Mega Virus rockets must still reach the exposed core they were aimed at.

## Checkpoints

Each wave is a checkpoint. If a mission fails after the first wave, the report offers **Retry from wave N**: the mission resumes at the start of the wave you lost, with the score, kills, tissue node integrity, turret and junction support exactly as they were when that wave began, and the field cleared. Suits come back with at least half their integrity. **Restart mission** starts over from wave 1. The pause menu also has **Restart from wave N**. In the Bronchial Fork the final airway objective is its own checkpoint, and in Capillary Junction so is Overtime. In co-op, readying up after a loss retries the squad from the checkpoint, with every suit's score and integrity restored.

## Difficulty

Choose **Easy**, **Medium**, or **Hard** on the deployment briefing. Hover, focus, or select an option to see exactly what it changes. The choice is saved in the browser and applies when each campaign or Free Mode mission starts, so you can change it between missions. The pause screen and mission report name the difficulty you're playing. Medium is the standard balance that every mission is tuned around, measured with a scripted player (see the development guide).

| | Easy | Medium | Hard |
| --- | --- | --- | --- |
| Pathogens per wave | One in three removed | Standard | One extra for every seven, except in Gastric Chamber |
| Spawn timing | 30% slower | Standard | 10% faster |
| Pathogen and Mega Virus health | −25% | Standard | +15% |
| Tissue damage | −35% | Standard | +10% in two-node arenas, standard in three-node arenas |
| Suit damage, including hazards | −40% | Standard | +15% |
| Tissue restored per repair pulse | +30% | Standard | −15% |
| Auto-turret placements | Two, so you can move it once | One | One |

**The campaign's curve.** Some missions adjust these to keep the campaign climbing toward its finale rather than spiking in the middle. On Medium, Intestinal Bend and Colonic Reservoir send slower, thinner waves (one pathogen in six and one in five held back) whose attacks tear tissue less (−38% and −45%); Inner Ear's waves come faster and tear tissue 20% harder; and Neural Cortex, the finale, sends faster waves with a few extra, tougher pathogens (+15% health) that tear tissue 60% harder. Hard pushes the finale further still and eases the tissue damage in Intestinal Bend and Colonic Reservoir so every mission can be won. The same exceptions as before keep Hard's extra pathogens out of the long organ missions.

Capillary Junction thins or reinforces each surge but always keeps the pathogen that triggers its forecast, and Overtime follows the same rules. The Heart Valve colonies and flank patrol, the bronchus and gastric counterattacks, the lower-passage flank, and the Mega Virus brood keep their numbers and timing; only their health and damage change. Online co-op always plays Medium. The best score on the main menu counts runs from every difficulty.

## Weapons and the Armory

You carry two weapons, a primary and a secondary, from the first mission. Pick any two different weapons in the **Armory**. Switch between them with **1** and **2**, the mouse wheel, **Y** on a controller, or the **Swap** button (two opposing arrows) on touchscreens. Each weapon keeps its own magazine when you switch. Drawing a weapon takes a moment, and you can't fire until it's up. Missions start with the primary. Every weapon has unlimited reserve ammunition.

| Weapon | Role | How it plays |
| --- | --- | --- |
| Needle Carbine | Assault | Accurate automatic fire, 30 rounds. The default primary. |
| Lancet Rifle | Sniper | 110 damage per bolt-action shot, once a second, 5 rounds. Deep zoom and a scope overlay when aimed, with near-perfect accuracy; wild from the hip. |
| Burst Scattergun | Shotgun | Nine pellets per shell, 6 shells. Devastating up close; damage falls off sharply past 7 m and bottoms out at 22 m. |
| Phage Launcher | Rocket | Two rockets that fly visibly and burst on impact, splashing every pathogen within about 5 m (Shellback armor doesn't stop splash). Very slow 3.9 s reload. |
| Sting Pistol | Sidearm | Light 11-damage rounds at 830 rounds a minute, 16 per magazine, half-second reload, and a little extra move speed. The default secondary. |

Every weapon spreads its shots in a cone. Aiming down sights (hold right click or LT) narrows the cone and zooms in, and the crosshair widens and narrows with the current spread. The Lancet's scope zooms furthest.

### The Armory

The Armory is a gunsmith bench on a hospital lab workbench. The weapon floats over a maintenance pad and turns when you drag it, above stat bars for the current build. It is open from the title menu, the deployment briefing and the report between missions; it stays closed during a mission, where each wave is followed by a short countdown to the next. It has three tabs:

- **Weapons** picks your primary and secondary, your **nano companion** (the auto-turret or the medic drone, see [below](#nano-companions-turret-or-medic-drone)) and lists your **tissue sealer** (see [below](#the-tissue-sealer)). A row of item tabs in Gunsmith and Customize switches between all four.
- **Gunsmith** pins a callout to each attachment point on the weapon — barrel, muzzle, optic, receiver and magazine; pick one to list its three options, each with a picture and its gains and losses. Parts change damage, fire rate, spread, zoom, capacity, and reload speed, scaled to each weapon.
- **Customize** covers finish, accent, skin, decal, sticker and charm.

Pointing at or focusing any option previews its effect on the stat bars in green and red before you equip it. Builds for all five weapons are saved in the browser and work alongside your field upgrade. Each weapon has its own cosmetics:

- **Body finish**: Factory ivory, Obsidian, Arctic, Crimson, Moss, Desert, Gunmetal, Midnight navy, Cobalt, Deep teal, Toxic lime, Plum, Bubblegum, Rose gold, Burnt copper or Ash gray, and an **accent color**.
- **Skins** that wrap the polymer furniture in a pattern: Tiger, Zebra, Winter camo, Woodland camo, Urban digital, Carbon fiber, and the glowing Cyberpunk and Molten core. The body finish still colors the metal.
- **Decals** printed along the side: Racing stripes, Hot rod flames, Kill tally, Hazard chevrons, Circuit traces, Barcode, Unit 07, Paint splatter, Capsid parade, Double helix, Claw marks, Pixel fade, Lightning, Shooting stars, Contagion tape, Pinstripe, Medic crosses, or Resonance. On the Phage Launcher they wrap around the tube.
- **Stickers** printed on the receiver: Biohazard, Happy virus, Voltage, Big heart, Pathogen skull, Gold star, Hallucinated crest, Double helix, Antibody, Hot shot, Snowflake, Tiger paw, Crosshair, Lab cat, Pizza slice, Rainbow, or Peace.
- **Charms** that dangle and swing beside your support hand and buff the weapon while it's in your hands:

| Charm | Buff | Effect |
| --- | --- | --- |
| Lucky clover | Luck | Critical hit zones 30% larger |
| Macrophage fang | Strength | +10% damage |
| Quicksilver hourglass | Reload speed | Reloads 20% faster, swaps 25% faster |
| Flagellum feather | Movement speed | +8% move speed |
| Steady eye | Accuracy | 30% tighter spread |
| Ration capsule | Capacity | 25% larger magazines |
| Gambler's die | Fortune | Critical hit zones 18% larger, +4% damage |
| Antibody | Precision | +6% damage, 10% tighter spread |
| Frost crystal | Composure | Reloads 10% faster, 12% tighter spread |
| Heart locket | Agility | +5% move speed, swaps 20% faster |
| Tiger claw | Ferocity | +7% damage, critical zones 10% larger |
| Berserker skull | Fury | +15% damage, but 12% wider spread |
| Spare cell | Endurance | 15% larger magazines, reloads 8% faster |
| Shooting star | All-rounder | +3% damage, 5% faster reloads, +3% move speed, 5% tighter spread |

More finishes, accents, skins, stickers and decals are unlocked by [achievements](#achievements).

## Nano companions: turret or medic drone

Every suit brings one nano companion. Pick it in the Armory's Weapons tab under **Companion**; the choice is saved with your loadout and shown on the deployment briefing. In co-op each player picks their own, so a squad can field two turrets and a drone, three drones, or any mix.

### The auto-turret

You can deploy one turret per mission on clear ground ahead of you, or place it twice on Easy. Hold the turret control (Q, RB, or the touch turret button, which shows a turret in a frame while the turret is out) at any time to pick it up: it slides along the clear ground in front of you and holds fire until you release. It fires on automatic at a third of the Needle Carbine's rate (22 damage about three times a second), at targets within 20 meters that it has a clear line to. It favours pathogens latched onto tissue, its hits slow pathogens, and it can knock a given pathogen out of an attack once every 1.6 seconds. Put it near an approach to the node you plan to leave. A turret placed on raised ground gains 12% range per metre of height.

Fit its parts in Gunsmith:

- **Barrel**: heavy for damage or short for rate.
- **Receiver**: cryo for a longer slow, or shock to stagger attacks every second.
- **Sensor**: long-range to 26 m, or close-in for faster fire.

Dress it in Customize with the same finishes, accents, skins, decals, stickers and charms as your guns. A charm's damage buff carries over to the turret. The turret you place uses your build, in co-op too, and every player who brought a turret places their own.

### The medic drone

The medic drone is a small quad-rotor medic that flies just ahead of your right shoulder, in the upper right of your view, and follows you everywhere, banking as it flies. It mends one target at a time: whichever suit (yours or a teammate's) or tissue node within 8 m of it has lost the most, with a green beam from its belly emitter. Mending is deliberately slow: **1 point a second**, against about 16 a second from the tissue sealer, so it tops a defence up between pushes rather than saving one in the middle of a fight. It mends a suit only once that suit has gone **2 seconds without being hit**, so it can't out-heal a pathogen chewing on you, and it waits out a suit's hits by mending a nearby node instead. It follows the sealer's rules: no mending through the Neural Cortex overload, and a heart wound only while its valve is shut. It never fights and can't be hurt. In the Inner Ear the resonance jams it, as it jams a turret on the floor, unless it hovers over the cochlea's perch.

Press the turret control (Q, RB, or the touch drone button, which shows the drone over a pin) to **station** the drone where it is: it holds that spot and keeps mending around it, for example over the node you are about to leave. Press again (the drone with a return arrow) to bring it back to your shoulder. The HUD shows what it is doing: following, stationed, mending a suit or tissue, or jammed. Mended tissue scores like a sealer repair.

Fit its parts in Gunsmith:

| Slot | Options |
| --- | --- |
| Emitter | **Field** (1 point a second on suits and tissue), **Triage** (suits 40% faster, tissue 40% slower) or **Graft** (tissue 40% faster, suits 40% slower) |
| Field | **Service** (8 m), **Wide** (11 m, 15% slower) or **Focus** (5 m, 15% faster) |
| Rotors | **Service**, **Sprint** (flies 35% faster, mends 5% slower) or **Heavy** (flies 30% slower, mends 10% faster) |

Dress it in Customize like a gun: finish, accent, skin, decals along its sides, a sticker on its top deck, and a charm hanging under its back-left arm. A charm's damage buff carries over as extra mending, the way it carries over to turret damage.

**Turret or drone?** The turret holds one approach hard and protects tissue. The drone keeps your suit alive and patches whatever is near it. In headless balance tests on Medium, a scripted player that never dodges won slightly more often with the drone (because suit damage is what usually ends its runs), and lost more of its missions to tissue failing; with the turret it lost more to its suit failing.

## The tissue sealer

The tissue sealer is your repair tool: hold Repair (E, LB) by a damaged tissue node, an open gash, a blocked bronchus or a gastric valve. Each pulse every 0.82 seconds restores 13 tissue (about 16 a second) within 5.4 m; the Fast Sealer field upgrade raises it to 18 a pulse, Easy adds 30% and Hard takes 15%. You can't fire while sealing. Tissue nodes are solid: you walk or dash around one, not through it, and the sealer reaches it from its edge. So are the bases of the great vessels that come down to the artery floor. In balance tests, moving the sealer between 11 and 15 a pulse made no measurable difference to win rates, so its numbers are unchanged: missions are lost in the fighting, not in the repairs.

Select **Sealer** in the Armory to paint it like your guns in Customize: finish (which also tints its frame and fittings), accent (its reagent cell, sight glass and indicator), skin, decals along both sides of its housing, a sticker on its top deck, and a charm swinging from its front collar. On the sealer these are cosmetic: a charm never changes how it repairs.

## Controls

| Action | Keyboard and mouse | Xbox controller |
| --- | --- | --- |
| Move | WASD | Left stick |
| Look | Mouse or arrow keys | Right stick |
| Fire | Left click or Enter | Hold RT |
| Jump | Space | A |
| Dash (dodges hits during the first 0.3 s) | C | B |
| Bash | V or F | Click the right stick |
| Antibody grenade | G | D-pad up |
| Stun charge | T | D-pad down |
| Aim | Hold right click | Hold LT |
| Sprint | Shift | Click the left stick |
| Reload | R | X |
| Repair | Hold E near a damaged tissue node or open gash | Hold LB |
| Deploy auto-turret, or station / recall the medic drone | Q | RB |
| Drag the placed turret to a new spot | Hold Q | Hold RB |
| Switch weapon | 1 / 2 or mouse wheel | Y |
| Pause | Esc or P | Menu ☰ |

**Rebinding.** Every keyboard binding can be changed in **Settings > Key bindings**: press an action's button, then the new key (Esc cancels). Choosing a key another action already uses swaps the two. Esc always pauses and the arrow keys always look, so you can never lock yourself out. The field manual, HUD and hints always show your current keys. **Reset key bindings** restores the defaults. Controller buttons can be changed the same way in **Settings > Controller buttons**: choose an action, release the button you chose it with, then press the new one. Menu always pauses and the menus keep A, B and the D-pad, so you cannot lock yourself out; **Reset controller buttons** restores the defaults. During a Capillary Junction break the D-pad still picks support.

**Controller.** Connect an Xbox controller to your device and press a button with the game tab focused. Use the D-pad or left stick to navigate menus, **A** to select, and **B** to go back. Enter co-op callsigns and room codes with your keyboard.

**Touch.** On touchscreens, move with the joystick, drag to look, and use the action buttons. Each button shows a drawn icon rather than a word: a reticle to **fire**, a frag grenade, a lightning bolt in a ring for the **stun charge**, an up arrow for **jump**, chevrons for **dash**, a fist for **bash**, opposing arrows to **swap** weapons, a turret (or the medic drone) for your companion, a magazine in a turning arrow to **reload**, and a wrench to **repair**. When mouse capture is unavailable, drag the view to look. Phones use a compact HUD in landscape and portrait: tissue bars across the top, small health and ammo readouts, and touch buttons in the lower corners.

**Motion tracker.** A round radar in the top-right corner shows what is around you within 30 m, with the way you face at the top and the view cone shaded: red dots for pathogens (larger for bigger ones, with a ▲ or ▼ when one is well above or below you, and a ringed dot for a boss), orange rings for brood nests, green crosses for antibody caches, small teal squares for your turret and medic drone, and yellow dots for squadmates. Tissue nodes are diamonds in their HUD colours, turning red when critical and ringed while under attack. Nodes, bosses and squadmates beyond range sit on the rim, pointing the way to them. A ping sweeps out from the centre every 1.6 seconds (not with Reduce motion). Score remains available in Pause.

If your browser blocks audio until you interact, click the game or press a key once to turn it on.

## Suit abilities

The grenade and stun counts and the dash and bash charge bars sit above your suit integrity. In co-op each suit has its own abilities.

- **Dash** throws the suit about 5 m in the direction you are moving (backwards if you are standing still). Any hit that lands in the first 0.3 s is dodged outright: in solo play time slows for a beat and the view drains to steel while you reposition. It recharges in 1.1 s. A pathogen winding up is the moment to dash.
- **Jump** clears about a metre: hop a crawler or a spore's burst. You keep steering in the air.
- **Bash** swings the weapon butt in front of you. It deals 36 damage, knocks pathogens back several metres and staggers them, and tears off any pathogen latched onto a tissue node within 4 m, even behind you. It recharges in 0.7 s.
- **Antibody grenade** arcs where you aim, bounces, and bursts after 1.5 s or on contact with a pathogen: 150 damage in a 6 m blast that also throws smaller pathogens off the tissue they held. You carry two, restocked at every wave start, and each antibody cache adds one (up to three).
- **Stun charge** sticks to the first pathogen it touches or rests where it lands, then discharges: every pathogen within 7 m freezes for 3.2 s and drops its attack. Bosses and nests are only slowed. You carry one, restocked every wave (up to two).

## Organ hazards and raised ground

Organ hazards are a real threat to your suit, not just a nuisance: a full acid surge in the stomach costs about a third of your integrity, and the gut's contraction, the colon's squeeze and the macrophage's crush hit harder still. The lungs' exhale batters you as it pushes you back, and the inner ear's resonance shakes your suit while it slows you. Raised ground that clears a hazard is the best way to ride it out, and the Insulated Suit field upgrade still cuts acid, contraction and squeeze damage by 40%.

Every arena has raised ground. The suit walks up steps under 0.42 m and up ramps, jumps onto anything up to about 1.1 m, and drops off edges. Crawlers walk the floor and must go around raised ground, so high ground keeps them off you. Floating pathogens drift over it and rise toward a suit on a perch, and spore throwers lob their spit in an arc over raised ground and at a suit standing on it, so high ground is an advantage, not a hiding place. Grenades and stun charges bounce off its edges and settle on top. A turret placed on raised ground gains 12% range per metre of height.

| Arena | Raised ground |
| --- | --- |
| Arterial Junction | A plaque overlook with a walkable ramp beside each node, a tall shelf in the middle you have to jump onto for a view over all three nodes, and low ridges across the inlet lanes to hop over or stand on. |
| Capillary Junction | Overlooks outside both nodes, a shelf between them, ridges on the way in. |
| Heart Valve | A shelf at the hub to see every valve from, overlooks in two far quarters, and low ridges to hop on the runs between valves. |
| Lungs | Alveolar platforms that rise and fall about 0.8 m with every breath (no turret on them), and bronchial ridges along the airway. |
| Stomach | Acid floods the whole chamber in surges. 78 rugae islands are scattered everywhere: one beside each node and valve for repairs, a backbone so you are never more than a few seconds from safety, walk-up mounds, and small stepping pads for jump chains. Standing on any of them keeps you out of the acid. |
| Intestines | The contraction sweeps the whole bend, so eleven stepped villus terraces stand across it, each six walkable steps up to 2.28 m. The crest reaches about 1.7 m, so the top two tiers ride it out. Nowhere in the wave's path is more than about 22 m from a terrace. |
| Colon | Haustral folds a jump tall (1.05 m), with walk-up pads beside them. On a fold's crest the squeeze passes beneath you. |
| Lymph Node | A three-tier lookout in the middle of the follicle. |
| Inner Ear | The cochlea: a spiral stair to a 2.5 m perch. A turret on the perch stands above the resonance and never jams. |
| Neural Cortex | A walkway of raised synapse pads between the nodes, each a jump apart. |

**White blood cells.** Friendly neutrophils patrol the bloodstream, colon and lymph node arenas, hunting stray bacteria, and the lymph node's macrophage roams its follicle. They are harmless, and you can walk straight through one. Inside, the view fills with milky cytoplasm; coming out, the visor is left coated in plasm that sags and drips for a moment before your suit wipes it off with the off hand (your weapon dips while it does), leaving a few streaks that clear on their own. **Visor cracks.** As your suit integrity falls, the visor glass cracks: the first at 70%, toward the edge of the glass, then more at 52%, 36%, 22% and 10%, the last near the middle of your view. Healing back above a crack's level (the medic drone, an antibody cache) seals it with a flash of green sealant. A pathogen that pounces onto your suit does the same with its own fluid (a Grip Phage keeps it there for as long as it clings): it splats across the visor, stays there while the pathogen is still on you, and is wiped off once you are free. Spat globs leave a lighter splat. With **Reduce motion** on, the goo stays still and the visor clears without the hand.

## Pathogens and the disease guide

Open **Disease guide** on the main menu to browse every pathogen. Each entry shows its animated 3D model (drag to turn it, or choose **Provoke** to see its attack windup), a description and counter tactics, its health, speed, damage and score, the missions it attacks in, and three facts. The stats and mission lists come straight from the game rules, so they stay current.

Biological pathogens lunge, latch or spit:

- **Lungers** coil, then leap at a fixed landing point. Viruses coil before lunging; step sideways during the windup to evade.
- **Latchers** ignore your suit, grab a tissue node and tear. Bacilli head straight for the tissue, brace, and tear until you dislodge them.
- **Ranged** pathogens hang back and spit. Spores swell before spitting a slow projectile; step sideways during the windup.
- **Shellbacks** guard their front. Aim for exposed tissue from the side or rear.
- **Splitters** break into two smaller attackers on death, so keep the area in sight after the first kill.
- **Grip Phages** hunt suits, not tissue. A green phage that senses suits all around it, it leaps at your visor and, if the pounce lands, **clings to it**: your visor is smeared with its fluid, you move at about half speed, and your suit drains (about 2.5% a second on Medium). An alarm under the crosshair names your bash control, and on touchscreens the bash button glows red. **Bash it off** (it is thrown back and stunned), shoot it point-blank, or stun it; it lets go by itself after about four and a half seconds. Each wave that brings them brings a couple, not a swarm. Dashing through the pounce's dodge window stops it latching, and only one can hold a suit at a time.

The hacked **Rogue Bot** hunts human players with a laser cannon: its aiming line commits for a 0.95-second warning, then fires once and cools down. Sidestep or use solid cover. It never attacks or damages tissue. Its ground-running sibling, the **Crawler**, sprints across the floor on eight legs, circles in close and fires a short surgical laser after a brief 0.5-second lock that reaches only 9 m. Keep your distance or step across its line, then shoot it while it recovers.

| Pathogen | Behavior | First seen in |
| --- | --- | --- |
| Crown Virus | Lunger | Arterial Junction |
| Spitting Spore | Ranged | Arterial Junction |
| Bacillus | Latcher | Arterial Junction |
| Valve Colony | Rooted behind a heart valve, spits through it while it is open | Heart Valve |
| Phage Lander | Lunger, lighter and quicker | Arterial Junction, Wave 4 |
| Filovirus | Latcher, tears a little faster | Arterial Junction, Wave 4 |
| Blister Mortar | Ranged, tougher than a spore | Arterial Junction, Wave 5 |
| Shellback | Latcher with an armored front | Bronchial Fork |
| Splitter | Lunger that splits in two on death | Bronchial Fork |
| Whiptail | Lunger, sturdier and harder hitting | Gastric Chamber |
| Amoeba | Latcher, slow and very tough | Gastric Chamber |
| Rogue Cell | Latcher, hits hard | Lymph Node |
| Rogue Bot | Player-only laser drone, patrols and uses cover | Arterial Junction, Wave 3 |
| Crawler | Fast eight-legged ground drone with a short-range laser, player-only | Arterial Junction, Wave 4 |
| Grip Phage | Lunger that clings to a suit's visor and drains it until bashed off | Arterial Junction, Wave 3 |

**Elite pathogens.** Now and then a pathogen arrives mutated. An elite glows in its mutation's colour, wears a glyph floating over it, and shows a coloured ring on the motion tracker:

| Elite | Glow and glyph | What changes |
| --- | --- | --- |
| Armoured | Gold, a shield | Nearly twice the health, a coat that turns about a quarter of every hit, a little slower and bulkier |
| Swift | Cyan, chevrons | Half again as fast, a little tougher, and recovers from its attacks sooner |
| Splitting | Magenta, a split circle | Tougher, and bursts into two fast fragments when it dies |

Elites first appear in the last two waves of Arterial Junction and grow more common through the campaign and with every wave (up to about one pathogen in seven), and in Endless as the waves climb (up to one in four). Easy halves the chance and Hard raises it by 30%. Rogue Bots and Crawlers can only be armoured. Elites are worth 60–80% more score. They never appear in Capillary Junction, the Heart Valve, training or as bosses.

## Achievements

Fifty-nine achievements, worth 1,000 points in all, work like console achievements and trophies. Each has its own artwork, a tier (**bronze**, **silver**, **gold** or **platinum**) and a score. When you earn one, an **Achievement unlocked** banner pops in with the art, the trophy and the score, plays a chime and a light rumble, then folds away; several in a row queue up. In a mission it sits under the wave panel, clear of the crosshair; in menus it appears low in the centre. Earn every other achievement for the platinum, **Immune Protocol**. See [every tile](achievement-artwork.png).

Open **Achievements** from the main menu or the pause screen. The overview shows your completion ring, score and trophy count per tier, what you earned most recently and what you are closest to; tabs (or a picker on narrow screens) group the rest into Campaign, Combat, Bosses, Field ops and Mastery. Locked achievements show their art dimmed under a lock, and counting ones show a progress bar. Select one for large art, its tier, score and date earned. Two are hidden until you earn them.

| Category | Examples |
| --- | --- |
| Campaign | Secure each of the ten missions (*Clot Buster*, *Be Still, My Heart*, *Iron Stomach*, *Hear Me Out* …), finish the campaign (*The President Is Safe*), win on Hard (*House Call*) and win every mission on Hard (*Chief of Medicine*). |
| Combat | Kill milestones from *Patient Zero* to *Pandemic Over* (25,000), 1,000 critical hits, a milestone for each weapon, five kills with one rocket (*Collateral Damage*), four with one grenade, fifteen in five seconds (*Fever Pitch*), melee kills, a six-pathogen stun and 25 perfect dodges. |
| Bosses | Your first boss, then each boss's own trick: run the Thrombus Titan into a wall (*Off the Wall*), knock the Leech loose, destroy all seven Tapeworm segments, break the Macrophage's pull; defeat the Mega Virus and every boss (*Rogues' Gallery*). The Mega Nano Bot has three of its own: destroy it (*Lobotomy*), break all three shield pylons within eight seconds of the shield going up (*Short Circuit*), and destroy it without it ever damaging your suit (*Ghost in the Machine*). It does not count toward *Rogues' Gallery*. |
| Field ops | Brood nests, antibody caches, sealed gashes, tissue restored, turret kills, a co-op win, studying 12 pathogens in the Disease guide, and deploying a weapon with a skin, decal, sticker and charm. |
| Mastery | Win with every node at full integrity, with your suit at 10% or less, without deploying the turret, after a checkpoint retry, through Capillary Overtime, with each field upgrade; score 75,000 and 100,000 in one mission. |

Twenty-three **rewards** are locked until their achievement is earned. They are cosmetic only and never change how a weapon handles. The Armory's Customize tab lists them with a lock and the achievement that unlocks them. Achievement cards, the detail view and the unlock banner name the reward.

| Reward | Earned by |
| --- | --- |
| Skins: Bloodstream, Neural net (glows), Outbreak, Prismatic (holographic) | *Clot Buster*, *Mind Over Matter*, *Pandemic Over*, *Immune Protocol* |
| Finishes: Surgical steel, Presidential gold, Platinum | *Chief of Medicine*, *The President Is Safe*, *Immune Protocol* |
| Accents: Code red, Viral magenta | *House Call*, *Going Viral* |
| Stickers: Trophy, Field medic, Squad up | *Rogues' Gallery*, *Tissue Engineer*, *Squad Goals* |
| Decals: Heartbeat, Blast radius | *Vital Signs*, *Collateral Damage* |
| Boss operator emblems: Biofilm Colossus, Thrombus Titan, Capillary Leech, Tapeworm, Rogue Macrophage, Otolith Screamer, Mold Crown, Pylori Drill, Mega Nano Bot | *Giant Slayer*, *Off the Wall*, *Leech Removal*, *The Worm Has Turned*, *Indigestion*, *Final Diagnosis*, *Take a Deep Breath*, *Iron Stomach*, *Lobotomy* |

Achievements count in the campaign, Free Mode and co-op. In co-op, your own kills, hits, dodges and pickups count for you; squad events such as sealed gashes and bosses count for everyone. Hard-mode achievements need solo runs, because co-op always plays Medium. Mega Virus practice earns *Going Viral* but not the Neural Cortex. Progress is saved in the browser for the active operator profile, every few seconds during play and at the end of each mission.

## Operator profiles

Several players can share one computer and browser, each with their own save. The operator chip at the top right of the title screen shows who is playing; select it to open **Operators**, where you can:

- switch operator (the title screen, campaign route, best score, loadout and achievements change straight away, with no reload);
- create a **New operator** with a fresh save (up to eight per browser);
- change the active operator's **callsign** (up to 16 characters, unique on the device) and **emblem**: a helmet close-up of each co-op suit first (Vanguard, Wraith, Lifeline and Bathysphere), then fourteen pathogen portraits, plus eight boss emblems earned through achievements;
- **Delete operator**, after a confirmation that names what will be lost. The last operator cannot be deleted;
- **Back up operator** downloads the active operator's save as a small `.json` file, and **Restore from backup** adds it back as a new operator, on this browser or another device. Restoring never overwrites an existing operator; a clashing callsign gets a number. A backup holds only that operator's progress, never device settings, and the game rejects files that are not operator backups or are from a newer version.

Each operator card shows missions secured, achievements and points, best score and when they last deployed. When more than one operator uses the browser, startup asks **Who's deploying?**; on a brand-new browser it offers to name the first operator.

| Kept per operator | Shared by the device |
| --- | --- |
| Campaign checkpoint and unlocked missions, best score, Endless records, Mega Virus practice unlock, training, briefings and ability hints already seen, weapons, parts and cosmetics, Free Mode field upgrade, difficulty, co-op callsign and suit, achievements and their progress | Graphics, audio levels and mute, look sensitivity, gameplay and accessibility settings, keyboard and controller bindings |

Saves live in your browser's storage, so clearing site data erases them. Use **Back up operator** to keep a copy. A browser that saved progress before profiles existed moves that save into the first operator, named after its co-op callsign if it had one.

## Online co-op

Two or three players share all ten missions in one room, from Arterial Junction to the Mega Virus fight in Neural Cortex. On the [co-op server's game page](https://immune-protocol-coop.onrender.com/), open **Online co-op**, enter a callsign, and choose **Create room**. Send the invite link to one or two friends. They open it, enter callsigns, and choose **Join room**. The room holds up to three players and starts when all joined players choose **Ready**, with a minimum of two. Invite a third player before the pair readies up; matches do not accept new players after deployment.

The free server can take about a minute to wake after 15 minutes of inactivity, and rooms are lost if the server restarts.

In the lobby, each player picks a suit: **Vanguard** (heavy assault armor), **Wraith** (stealth infiltrator), **Lifeline** (field corpsman), or **Bathysphere** (deep-dive pressure suit). Once you're in a room, the lobby becomes a full-screen miniaturization lab in a futuristic hospital: all joined players stand in their suits on the reduction pads of the shrinking machine, beside a holographic patient with the injection site marked, the injection capsule and live operator consoles. A ready player's pad lights up, and when the squad is ready the machine charges. Your teammates see your suit during missions. Suits can be changed in the lobby or at a mission checkpoint, and the browser remembers your choice.

After each mission, all players ready up at the shared checkpoint. A win unlocks the next deployment in the room, while a loss lets the squad retry the current mission. Each deployment starts with fresh suits and supplies and keeps every player's weapon loadout. The squad extracts after stabilizing Capillary Junction and earns a combined campaign report after the final boss. Campaign progress belongs to the active room.

Each suit has its own two weapons, builds, ammo, health and nano companion: its own turret to place, or its own medic drone, which mends teammates as well as you. Co-op missions always use the Medium difficulty. You share the tissue nodes, the wave timer, and the mission score. Teammates see your shots, rockets, and explosions. If one suit goes down, it returns at the next wave if a surviving teammate clears the current one. Waves follow each other after a short countdown; the Armory is available in the lobby and at the checkpoint between missions. The game keeps a score for each player — points for the pathogens they neutralize and the tissue they repair — and shows it on screen beside the team total, in the mission report, and as campaign totals when the campaign ends. Wave-clear bonuses and turret kills count toward the team score only. The game holds your place for up to 75 seconds after a disconnect.

To host your own co-op server, see [Host online co-op on Render](development.md#host-online-co-op-on-render).

## Settings

Settings is available from the main menu and pause screen. All settings are saved in the browser, and **Reset to defaults** restores every one.

| Group | Options |
| --- | --- |
| Controls | Look sensitivity (mouse, touch and the right stick), invert vertical look, aim sensitivity (multiplies look speed while aiming down sights), controller look speed, hold or toggle aim, and ability hints. |
| Key bindings and controller buttons | Rebind every action (see [Controls](#controls)). |
| Video | Graphics quality (Low reduces rendering load), brightness, field of view (55–90°; optics keep their relative zoom), resolution scale (Dynamic, or a fixed 100/85/70/50%), frame-rate limit (display rate, 144, 120, 60 or 30 FPS), bloom, ambient occlusion, vignette, film grain, chromatic aberration (these five apply on High), and an on-screen frame-rate counter. |
| Audio | Master, music, effects and ambience volume, and mute all audio. |
| Accessibility | Camera shake strength, damage flash strength, and reduce motion (match the system setting, or force it on or off). |

With Dynamic resolution, the game renders at a lower resolution when the frame rate drops below about 50 fps, down to 60% per axis, and sharpens again once it has headroom. Phones and tablets default to Low graphics unless you choose otherwise. If a heavy scene still runs slowly, try Low graphics.

## Language

The game is available in **English, Spanish (Español), German (Deutsch), French (Français), Simplified Chinese (中文（简体）), Traditional Chinese for Taiwan (中文（繁體）) and Hindi (हिन्दी)**. Choosing a language is the first thing the game asks: on your first visit, as soon as it has loaded, a **Choose your language** screen lists every language in its own script, with the one your browser uses already highlighted (Traditional Chinese for Taiwan, Hong Kong and Macau browsers, Simplified for other Chinese settings, English when the game doesn't speak your browser's language). Creating a **New operator** starts with the same screen, before the callsign and emblem.

The language belongs to the operator, so each operator on the device keeps their own and switching operator switches language. To change it later, open the operator chip on the title screen: **Language** is the first setting of the active operator. It changes at once.

Menus, the HUD and announcements, mission briefings and reports, the Armory, the Disease guide, achievements, settings and the field manual are translated. The cinematics (the studio intro, mission briefing videos and the ending) stay in English for now. Chinese and Hindi use your system's fonts for those scripts.

## Ending, credits and music

Win the Neural Cortex to finish the campaign. Before the final report, a short ending plays: the President wakes and laughs, the doctor celebrates, and a nanonaut returns from the shrink chamber, closing on "The President is safe." The credits roll after it. Both can be skipped like the briefings, and the main menu's **Credits** option replays the credits at any time.

The original soundtrack fades between **Arterial Drift** in the menu and between waves, and **Immune Response** during combat. It starts after you interact with the game. The speaker button mutes both the soundtrack and sound effects.
