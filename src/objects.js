// Objekt-Trainer: Kategorien, Zuordnung der OpenMapTiles-POIs und deutsche Bezeichnungen der Fachrichtungen.

export const OBJ_CATS = [
  { id: 'kh', label: 'Krankenhäuser', icon: '🏥', find: 'Finde das Krankenhaus.' },
  { id: 'ez', label: 'Einkaufszentren, Kaufhäuser & Märkte', icon: '🛍️', find: 'Finde das Einkaufszentrum bzw. den Markt.' },
  { id: 'va', label: 'Stadien, Theater & Kinos', icon: '🏟️', find: 'Finde den Veranstaltungsort.' },
  { id: 'ho', label: 'Hotels', icon: '🏨', find: 'Finde das Hotel.' },
  { id: 'bi', label: 'Schulen & Hochschulen', icon: '🏫', find: 'Finde die Schule bzw. Hochschule.' },
  { id: 'be', label: 'Behörden & Polizei', icon: '🏛️', find: 'Finde die Dienststelle.' },
  { id: 'fz', label: 'Bäder, Zoos & Museen', icon: '🏊', find: 'Finde das Objekt.' },
];
export const CAT = Object.fromEntries(OBJ_CATS.map((c) => [c.id, c]));
export const DEFAULT_CATS = ['kh', 'ez', 'va'];

const EMERGENCY_NAME = /^(zentrale )?(notaufnahme|notfallaufnahme|rettungsstelle)|notfallzentrum|notaufnahme$/i;
const NOT_HOSPITAL = /hospiz|praxis|\bmvz\b|dialyse|nierenzentrum|physio|ambulanz für|tagespflege|sanitätshaus|labor\b/i;

/** Kategorie eines POI (Eigenschaften aus der OpenMapTiles-Ebene „poi“) oder null */
export function poiCategory(pr) {
  const name = String(pr['name:de'] || pr.name || '').trim();
  if (!name) return null;
  const c = pr.class, s = pr.subclass;
  if (c === 'hospital' && s === 'hospital') return EMERGENCY_NAME.test(name) || NOT_HOSPITAL.test(name) ? null : 'kh';
  if (c === 'shop' && s === 'mall') return 'ez';
  if (s === 'department_store' && /galeria|kaufhof|karstadt|kaufhaus|kadewe|breuninger|lafayette|engelhorn|ludwig beck|oberpollinger|alsterhaus|kaufland/i.test(name)) return 'ez';
  if (['doityourself', 'furniture', 'hardware', 'garden_centre'].includes(s) && /^(obi|hornbach|bauhaus|toom|hagebau|globus|ikea|höffner|xxxlutz|porta|möbel kraft|segmüller|roller|poco)\b/i.test(name)) return 'ez';
  if (c === 'stadium' && /stadion|arena|halle|sportpark|velodrom|eissport|sportforum/i.test(name) && !/sportplatz|bolzplatz|kleinspielfeld|turnhalle|schulsport/i.test(name)) return 'va';
  if ((c === 'theatre' && s === 'theatre') || c === 'cinema') return /amphitheater|freilicht/i.test(name) ? null : 'va';
  if (c === 'lodging' && s === 'hotel') return 'ho';
  if ((c === 'school' && s === 'school') || (c === 'college' && (s === 'college' || s === 'university'))) return 'bi';
  if ((c === 'town_hall' && (s === 'townhall' || s === 'courthouse')) || c === 'police') return 'be';
  if (c === 'swimming_pool' && /bad|schwimm|therme|halle/i.test(name)) return 'fz';
  if (c === 'water_park' || (c === 'zoo' && s === 'zoo') || c === 'theme_park' || (c === 'museum' && s === 'museum')) return 'fz';
  return null;
}

/** Eigenständige Notaufnahme-Punkte (werden dem nächsten Krankenhaus zugeordnet) */
export const isEmergencyPoi = (pr) => pr.class === 'hospital' && EMERGENCY_NAME.test(String(pr.name || ''));

/** OSM-Objekt aus der Feature-ID der Kachel (Planetiler: id*10 + 1 Knoten / 2 Weg / 3 Relation) */
export function osmRef(fid) {
  if (fid == null) return null;
  const t = Number(fid) % 10;
  const id = Math.floor(Number(fid) / 10);
  return { 1: 'N', 2: 'W', 3: 'R' }[t] ? `${{ 1: 'N', 2: 'W', 3: 'R' }[t]}${id}` : null;
}

export const SPECIALITY = {
  anaesthetics: 'Anästhesie', angiology: 'Angiologie', cardiology: 'Kardiologie', cardiac_surgery: 'Herzchirurgie',
  cardiothoracic_surgery: 'Herz-Thorax-Chirurgie', thoracic_surgery: 'Thoraxchirurgie', child_psychiatry: 'Kinder- und Jugendpsychiatrie',
  dermatology: 'Dermatologie', diabetology: 'Diabetologie', emergency: 'Notfallmedizin', endocrinology: 'Endokrinologie',
  gastroenterology: 'Gastroenterologie', geriatrics: 'Geriatrie', gynaecology: 'Gynäkologie', haematology: 'Hämatologie',
  intensive: 'Intensivmedizin', internal: 'Innere Medizin', nephrology: 'Nephrologie', neonatology: 'Neonatologie',
  neurology: 'Neurologie', neurosurgery: 'Neurochirurgie', nuclear: 'Nuklearmedizin', obstetrics: 'Geburtshilfe',
  oncology: 'Onkologie', ophthalmology: 'Augenheilkunde', orthopaedics: 'Orthopädie', otolaryngology: 'HNO',
  paediatrics: 'Kinderheilkunde', paediatric_surgery: 'Kinderchirurgie', palliative: 'Palliativmedizin',
  plastic_surgery: 'Plastische Chirurgie', psychiatry: 'Psychiatrie', psychosomatics: 'Psychosomatik', psychotherapy: 'Psychotherapie',
  pulmonology: 'Pneumologie', radiology: 'Radiologie', radiotherapy: 'Strahlentherapie', rheumatology: 'Rheumatologie',
  stroke: 'Stroke Unit', surgery: 'Chirurgie', trauma: 'Unfallchirurgie', traumatology: 'Unfallchirurgie', urology: 'Urologie',
  vascular_surgery: 'Gefäßchirurgie', oral_surgery: 'Mund-Kiefer-Gesichtschirurgie', maxillofacial_surgery: 'Mund-Kiefer-Gesichtschirurgie',
  burns: 'Brandverletzte', toxicology: 'Toxikologie', infectiology: 'Infektiologie', hepatology: 'Hepatologie',
  neuropaediatrics: 'Neuropädiatrie', paediatric_cardiology: 'Kinderkardiologie', addiction: 'Suchtmedizin',
};

export const specialityLabels = (list = []) => [...new Set(list.map((s) => SPECIALITY[s]).filter(Boolean))];
