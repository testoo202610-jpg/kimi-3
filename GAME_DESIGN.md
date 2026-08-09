# Game Design — Crimson Ramparts: Three Realms

An **original** Three Kingdoms-inspired RTS. No copyrighted content (maps,
names, UI, music, story) from any existing game is used. Historical flavour is
generic ancient-China: era, weapons, siege, court ranks — all public domain
cultural material, expressed with original names and art.

## Pillars

1. **Food is power.** Every body — worker, soldier, general — eats. Big armies
   need farms, granaries and safe supply lines, not just gold.
2. **Generals matter.** Units form armies under named generals with stats and
   abilities. A good general beats a bigger mob.
3. **Ground shapes war.** Rivers, mountain passes, bridges, roads and forest
   cover decide battles, not unit count alone.
4. **Cities are prizes.** Capture by siege + occupation, never by killing one
   building. Territory flows from cities: vision, income, supply, speed.

## Factions (3 at launch)

### Northern Dominion — the Iron Plains
- Bonuses: cavalry cost −15%, market income +10%, infantry +1 armor after
  `Drilled Ranks` tech.
- Unique tech: **Requisition Wagons** (supply wagons carry +50%, armies lose
  supply 25% slower).
- Elite unit: **Dominion Lancer** (heavy cavalry, charge trample).
- AI temper: aggressive raider; early cavalry harassment, mid-game conquest.
- Start: northern steppe corner; rich horses, poor farmland.

### River Kingdom — the Jade Delta
- Bonuses: boats +20% speed, archers +1 range, trade routes +25% gold, walls
  +20% hp.
- Unique tech: **Chain Harbors** (river crossings count as roads for supply).
- Elite unit: **Crossbow Guard** (long-range crossbow, bolstered damage).
- AI temper: defensive trader; fortifies crossings, attacks when outnumbering.
- Start: river delta with two bridges; rich fish/farmland, little ore.

### Western Alliance — the Hollow Hills
- Bonuses: infantry train 15% faster, generals gain XP 25% faster, morale
  decay halved in mountains, upkeep −10% for garrisons.
- Unique tech: **Cliff War-drums** (units on highland/choked tiles gain +2
  morale, +10% attack).
- Elite unit: **Oath-sworn Guard** (heavy infantry, unbreakable aura).
- AI temper: turtle-to-hammer; late pushes through mountain passes.
- Start: mountain valley; rich stone/iron, scarce wood.

## Generals (original, fictional)

| General | Faction lean | Leadership | Strategy | Combat | Governance | Ability |
|---|---|---|---|---|---|---|
| Pei Shang "the Ash Duke" | Dominion | 8 | 6 | 9 | 4 | **Forced March** (army +40% speed 10s, costs morale) |
| Lady Wusun Yara | Dominion | 7 | 8 | 6 | 5 | **Rally Troops** (instant +morale AoE) |
| Admiral Gué Moyu | River | 6 | 8 | 7 | 6 | **Fire Attack** (burning line vs units/ships) |
| Chancellor Fen Ruohai | River | 5 | 9 | 3 | 9 | **Rapid Recruitment** (queue −50% time 20s) |
| Marshal Togan Stone-brow | Western | 8 | 5 | 9 | 4 | **Defensive Formation** (square, +armor, immobile) |
| Sage-General Ba Qiren | Western | 7 | 9 | 5 | 6 | **Ambush** (army hidden in forest 15s, first strike bonus) |

Generals: command armies (morale/attack aura), or govern cities
(production/income bonus from Governance). Death = morale shock. One active
ability each, cooldown-gated.

## Resources

- **Food** — farms (renewable), hunting, fishing, granaries. Consumed per
  head per tick + recruitment. Starving armies lose morale/hp via supply.
- **Wood** — forests (depleting), lumber camps as drop-offs.
- **Stone / Iron** — deposit clusters, mine camps.
- **Gold** — deposits, markets, trade routes, taxes.
- **Horses (optional)** — pasture tiles; cavalry cost horses.

Workers gather → carry → drop at Town Center / resource camps / granary /
warehouse. Physical piles on-map; raiding drop sites steals gold.

## Buildings

Core: Town Center, House, Farm, Granary, Lumber Camp, Stone Camp, Mine Camp,
Market, Barracks, Archery Range, Stable, Blacksmith, Academy, Hospital,
Watchtower, Wall, Gate, Warehouse.
Advanced (Era 2+): Governor Palace, War Academy, Siege Workshop, Temple,
Embassy, Trade Guild.
Placement: grid-snapped preview, green/red validity (terrain, blockers,
city zone), worker construction with hammer time, repairable, destructible,
upgrades (visual tier swap).

## Population & Era

Cap = houses + city tier. Categories: civilians? (abstracted into cap),
workers, soldiers, generals. Eras: Settlement → City → Kingdom → Imperial,
gated by buildings + research, unlocking buildings/units/techs.

## Units & counters

Infantry: militia → spearman → swordsman → heavy infantry.
Archers: archer → crossbowman → elite archer.
Cavalry: scout → light → heavy. Siege: ram, siege tower, catapult, trebuchet.
Naval: transport, patrol boat, warship (rivers/lakes).
Counters (damage multipliers): spears > cavalry, cavalry > archers & siege,
archers > heavy/slow infantry, heavy infantry > light infantry, siege >
buildings. Armor = flat reduction, min 1.

Stats per unit: hp, attack, armor, range, speed, morale, vision, cost,
train time.

## Armies, supply, formations

Any selection can be assigned to a general → army panel shows general, count,
morale, supply, speed, strength. Formations: line / wedge / square / loose
(movement offsets, combat mods).
Supply% drains off controlled territory; roads, nearby friendly cities and
supply wagons slow it. Low supply: −morale, −speed; empty: hp attrition.

## Combat & morale

Real-time; armor, counters, terrain (highland/forest cover/choke), formation
mods, general aura, projectiles as simulated objects. Morale 0–100: casualties,
surrounded, low supply, general death drop it; victories, general aura,
friendly soil raise it. <15: unit routs (auto-flee, uncontrollable).

## Tech tree (examples)

Eras I–IV. Categories: Economy, Agriculture, Military, Engineering,
Governance, Trade.
E.g. Improved Farming (+food), Iron Tools (+gather), Composite Bow (archers),
Heavy Armor, War Horses, Fortified Walls, Advanced Siege, Military Logistics
(supply), plus faction uniques above. Research at Academy/War Academy,
gold+time cost, persisted in save and enforced by server in MP.

## Diplomacy & trade

Relations: ally / neutral / hostile per faction pair. Actions: propose
alliance, ceasefire, trade agreement, demand/send tribute, declare war. AI
scores offers on strength delta, relation history, war exhaustion.
Trade routes: city-to-city caravans/junks spawn gold over distance; raidable.

## Territory & capture

City radius projects territory grid (BFS influence). Effects: vision sharing,
+move speed on roads in own land, supply safety, tax income, AI value map.
Capture: raze/occupy military buildings → troops hold city control zone for
20s uncontested → ownership flips, territory recomputed, population partly
converts.

## AI

Utility-scored, not scripted: economy planner (worker/resource balance),
expansion (map value scouting around other starts), military (army composition
vs scout intel), defense (threat map, choke garrisons), diplomacy persona per
faction. Difficulty: Easy = slower decisions + smaller armies, Normal =
baseline, Hard = same rules + better planning (no free resources — audited by
economy tests).

## Victory

Skirmish: conquest (eliminate all) or **capture all 6 major cities**.
Later: scenario objectives, wonder countdown, regicide.

## Presentation

2D top-down, warm earth palette, lantern-red faction accents, procedural
placeholder art (geometric/roof shapes) until original art pass (Phase 9).
Audio: generated chiptune-free procedural/FOSS sfx only (Phase 9).
