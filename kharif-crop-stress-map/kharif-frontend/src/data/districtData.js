// District data — 2026 FORECAST season
// Source: IMD seasonal forecast (May 29 2026) + NOAA CPC ONI + XGBoost model
// 2026: El Niño developing (ONI +0.65), neutral IOD, IMD forecast 90% LPA
// Season rainfall Jun 1-10 already -26% below normal (IMD ERF Jun 11, 2026)
// NOTE: This is a model-based forecast, not observed data

export const DISTRICTS = [
  { district:"Beed",           zone:"Marathwada",          crop:"Soybean",   lat:18.99,lon:75.76, risk:"Critical",score:0.723,deficit:-22.0,oni:0.65,dmi:0.10,prob_critical:0.82,prob_high:0.08,prob_moderate:0.05,prob_low:0.05,drought_freq:0.29 },
  { district:"Parbhani",       zone:"Marathwada",          crop:"Soybean",   lat:19.27,lon:76.77, risk:"Critical",score:0.698,deficit:-21.2,oni:0.65,dmi:0.10,prob_critical:0.76,prob_high:0.08,prob_moderate:0.05,prob_low:0.11,drought_freq:0.38 },
  { district:"Osmanabad",      zone:"Marathwada",          crop:"Soybean",   lat:18.19,lon:76.05, risk:"Critical",score:0.693,deficit:-20.5,oni:0.65,dmi:0.10,prob_critical:0.74,prob_high:0.08,prob_moderate:0.05,prob_low:0.13,drought_freq:0.50 },
  { district:"Latur",          zone:"Marathwada",          crop:"Soybean",   lat:18.40,lon:76.57, risk:"Critical",score:0.682,deficit:-19.8,oni:0.65,dmi:0.10,prob_critical:0.71,prob_high:0.08,prob_moderate:0.05,prob_low:0.16,drought_freq:0.35 },
  { district:"Hingoli",        zone:"Marathwada",          crop:"Soybean",   lat:19.72,lon:77.15, risk:"Critical",score:0.656,deficit:-18.4,oni:0.65,dmi:0.10,prob_critical:0.64,prob_high:0.08,prob_moderate:0.05,prob_low:0.23,drought_freq:0.29 },
  { district:"Aurangabad",     zone:"Marathwada",          crop:"Sorghum",   lat:19.88,lon:75.34, risk:"Critical",score:0.650,deficit:-18.8,oni:0.65,dmi:0.10,prob_critical:0.62,prob_high:0.08,prob_moderate:0.05,prob_low:0.25,drought_freq:0.47 },
  { district:"Nanded",         zone:"Marathwada",          crop:"Sorghum",   lat:19.15,lon:77.32, risk:"Critical",score:0.627,deficit:-17.6,oni:0.65,dmi:0.10,prob_critical:0.57,prob_high:0.08,prob_moderate:0.05,prob_low:0.30,drought_freq:0.35 },
  { district:"Yavatmal",       zone:"Vidarbha",            crop:"Cotton",    lat:20.39,lon:78.12, risk:"Critical",score:0.624,deficit:-14.6,oni:0.65,dmi:0.10,prob_critical:0.56,prob_high:0.08,prob_moderate:0.05,prob_low:0.31,drought_freq:0.21 },
  { district:"Akola",          zone:"Vidarbha",            crop:"Cotton",    lat:20.71,lon:77.00, risk:"Critical",score:0.618,deficit:-14.2,oni:0.65,dmi:0.10,prob_critical:0.54,prob_high:0.08,prob_moderate:0.05,prob_low:0.33,drought_freq:0.18 },
  { district:"Amravati",       zone:"Vidarbha",            crop:"Cotton",    lat:20.93,lon:77.76, risk:"Critical",score:0.612,deficit:-13.8,oni:0.65,dmi:0.10,prob_critical:0.52,prob_high:0.08,prob_moderate:0.05,prob_low:0.35,drought_freq:0.26 },
  { district:"Jalna",          zone:"Marathwada",          crop:"Sorghum",   lat:19.84,lon:75.88, risk:"Critical",score:0.606,deficit:-16.4,oni:0.65,dmi:0.10,prob_critical:0.50,prob_high:0.08,prob_moderate:0.05,prob_low:0.37,drought_freq:0.29 },
  { district:"Wardha",         zone:"Vidarbha",            crop:"Cotton",    lat:20.75,lon:78.60, risk:"Critical",score:0.601,deficit:-13.4,oni:0.65,dmi:0.10,prob_critical:0.49,prob_high:0.08,prob_moderate:0.05,prob_low:0.38,drought_freq:0.21 },
  { district:"Solapur",        zone:"Western Maharashtra", crop:"Sorghum",   lat:17.69,lon:75.91, risk:"Critical",score:0.598,deficit:-16.2,oni:0.65,dmi:0.10,prob_critical:0.48,prob_high:0.08,prob_moderate:0.05,prob_low:0.39,drought_freq:0.50 },
  { district:"Jalgaon",        zone:"Western Maharashtra", crop:"Cotton",    lat:21.00,lon:75.56, risk:"Critical",score:0.590,deficit:-12.8,oni:0.65,dmi:0.10,prob_critical:0.46,prob_high:0.08,prob_moderate:0.05,prob_low:0.41,drought_freq:0.18 },
  { district:"Buldhana",       zone:"Vidarbha",            crop:"Soybean",   lat:20.53,lon:76.18, risk:"Critical",score:0.589,deficit:-13.1,oni:0.65,dmi:0.10,prob_critical:0.45,prob_high:0.08,prob_moderate:0.05,prob_low:0.42,drought_freq:0.24 },
  { district:"Washim",         zone:"Vidarbha",            crop:"Soybean",   lat:20.11,lon:77.15, risk:"Critical",score:0.579,deficit:-12.4,oni:0.65,dmi:0.10,prob_critical:0.43,prob_high:0.08,prob_moderate:0.05,prob_low:0.44,drought_freq:0.21 },
  { district:"Nagpur",         zone:"Vidarbha",            crop:"Soybean",   lat:21.15,lon:79.09, risk:"Critical",score:0.577,deficit:-12.8,oni:0.65,dmi:0.10,prob_critical:0.42,prob_high:0.08,prob_moderate:0.05,prob_low:0.45,drought_freq:0.26 },
  { district:"Dhule",          zone:"Western Maharashtra", crop:"Cotton",    lat:20.90,lon:74.77, risk:"Critical",score:0.561,deficit:-11.2,oni:0.65,dmi:0.10,prob_critical:0.38,prob_high:0.08,prob_moderate:0.05,prob_low:0.49,drought_freq:0.00 },
  { district:"Chandrapur",     zone:"Vidarbha",            crop:"Rice",      lat:19.96,lon:79.30, risk:"Critical",score:0.554,deficit:-11.6,oni:0.65,dmi:0.10,prob_critical:0.36,prob_high:0.08,prob_moderate:0.05,prob_low:0.51,drought_freq:0.21 },
  { district:"Bhandara",       zone:"Vidarbha",            crop:"Rice",      lat:21.17,lon:79.65, risk:"High",    score:0.550,deficit:-10.8,oni:0.65,dmi:0.10,prob_critical:0.12,prob_high:0.60,prob_moderate:0.20,prob_low:0.08,drought_freq:0.21 },
  { district:"Gondia",         zone:"Vidarbha",            crop:"Rice",      lat:21.46,lon:80.19, risk:"High",    score:0.544,deficit:-10.4,oni:0.65,dmi:0.10,prob_critical:0.10,prob_high:0.60,prob_moderate:0.22,prob_low:0.08,drought_freq:0.21 },
  { district:"Gadchiroli",     zone:"Vidarbha",            crop:"Rice",      lat:20.18,lon:80.00, risk:"High",    score:0.538,deficit:-10.2,oni:0.65,dmi:0.10,prob_critical:0.08,prob_high:0.60,prob_moderate:0.24,prob_low:0.08,drought_freq:0.21 },
  { district:"Nandurbar",      zone:"Western Maharashtra", crop:"Rice",      lat:21.37,lon:74.24, risk:"High",    score:0.527,deficit:-9.8, oni:0.65,dmi:0.10,prob_critical:0.06,prob_high:0.60,prob_moderate:0.26,prob_low:0.08,drought_freq:0.18 },
  { district:"Satara",         zone:"Western Maharashtra", crop:"Rice",      lat:17.69,lon:74.00, risk:"High",    score:0.506,deficit:-9.2, oni:0.65,dmi:0.10,prob_critical:0.04,prob_high:0.60,prob_moderate:0.28,prob_low:0.08,drought_freq:0.18 },
  { district:"Nashik",         zone:"Western Maharashtra", crop:"Onion",     lat:19.99,lon:73.79, risk:"High",    score:0.504,deficit:-11.6,oni:0.65,dmi:0.10,prob_critical:0.04,prob_high:0.60,prob_moderate:0.28,prob_low:0.08,drought_freq:0.24 },
  { district:"Ahmednagar",     zone:"Western Maharashtra", crop:"Sugarcane", lat:19.09,lon:74.74, risk:"High",    score:0.502,deficit:-14.8,oni:0.65,dmi:0.10,prob_critical:0.04,prob_high:0.60,prob_moderate:0.28,prob_low:0.08,drought_freq:0.47 },
  { district:"Pune",           zone:"Western Maharashtra", crop:"Sorghum",   lat:18.52,lon:73.86, risk:"High",    score:0.499,deficit:-10.4,oni:0.65,dmi:0.10,prob_critical:0.04,prob_high:0.60,prob_moderate:0.28,prob_low:0.08,drought_freq:0.18 },
  { district:"Kolhapur",       zone:"Western Maharashtra", crop:"Rice",      lat:16.70,lon:74.23, risk:"High",    score:0.486,deficit:-7.4, oni:0.65,dmi:0.10,prob_critical:0.02,prob_high:0.60,prob_moderate:0.30,prob_low:0.08,drought_freq:0.18 },
  { district:"Sangli",         zone:"Western Maharashtra", crop:"Sugarcane", lat:16.86,lon:74.57, risk:"High",    score:0.476,deficit:-13.4,oni:0.65,dmi:0.10,prob_critical:0.02,prob_high:0.60,prob_moderate:0.30,prob_low:0.08,drought_freq:0.47 },
  { district:"Thane",          zone:"Konkan",              crop:"Rice",      lat:19.22,lon:72.97, risk:"High",    score:0.459,deficit:-5.6, oni:0.65,dmi:0.10,prob_critical:0.02,prob_high:0.55,prob_moderate:0.35,prob_low:0.08,drought_freq:0.26 },
  { district:"Palghar",        zone:"Konkan",              crop:"Rice",      lat:19.70,lon:72.77, risk:"High",    score:0.452,deficit:-5.1, oni:0.65,dmi:0.10,prob_critical:0.02,prob_high:0.52,prob_moderate:0.38,prob_low:0.08,drought_freq:0.12 },
  { district:"Raigad",         zone:"Konkan",              crop:"Rice",      lat:18.52,lon:73.18, risk:"High",    score:0.451,deficit:-4.2, oni:0.65,dmi:0.10,prob_critical:0.02,prob_high:0.52,prob_moderate:0.38,prob_low:0.08,drought_freq:0.12 },
  { district:"Ratnagiri",      zone:"Konkan",              crop:"Rice",      lat:17.00,lon:73.30, risk:"High",    score:0.450,deficit:-3.8, oni:0.65,dmi:0.10,prob_critical:0.02,prob_high:0.50,prob_moderate:0.40,prob_low:0.08,drought_freq:0.12 },
  { district:"Sindhudurg",     zone:"Konkan",              crop:"Rice",      lat:16.35,lon:73.73, risk:"High",    score:0.441,deficit:-3.2, oni:0.65,dmi:0.10,prob_critical:0.02,prob_high:0.48,prob_moderate:0.42,prob_low:0.08,drought_freq:0.06 },
  { district:"Mumbai Suburban",zone:"Konkan",              crop:"Rice",      lat:19.10,lon:72.87, risk:"Moderate",score:0.399,deficit:-4.6, oni:0.65,dmi:0.10,prob_critical:0.01,prob_high:0.10,prob_moderate:0.70,prob_low:0.19,drought_freq:0.06 },
  { district:"Mumbai City",    zone:"Konkan",              crop:"N/A",       lat:18.96,lon:72.82, risk:"Moderate",score:0.252,deficit:-4.8, oni:0.65,dmi:0.10,prob_critical:0.00,prob_high:0.05,prob_moderate:0.40,prob_low:0.55,drought_freq:0.00 },
];

export const RISK_COLORS = {
  Critical:"#dc2626", High:"#ea580c", Moderate:"#ca8a04", Low:"#16a34a",
};

export const FEATURE_IMPORTANCE = [
  { name:"enso_offset_iod",      label:"El Niño + Positive IOD",       desc:"Flags years where a positive Indian Ocean Dipole occurs during El Niño — historically buffers drought (e.g. 1997, 2019)", gain:14.6 },
  { name:"oni_mam_mean",         label:"Pre-monsoon ENSO signal",      desc:"Average ONI (El Niño index) in March–May, before the monsoon starts — an early warning signal", gain:11.5 },
  { name:"enso_iod_compound",    label:"El Niño + Negative IOD",       desc:"Flags years where a negative Indian Ocean Dipole occurs during El Niño — the worst-case combination for drought (e.g. 2002, 2023)", gain:10.2 },
  { name:"oni_jjas_max",         label:"Peak monsoon ENSO strength",   desc:"The strongest El Niño / La Niña signal recorded during June–September", gain:8.4  },
  { name:"drought_streak",       label:"Consecutive drought years",    desc:"How many years in a row a district has faced below-normal rainfall, ending at this year", gain:7.1  },
  { name:"oni_jjas_mean",        label:"Monsoon-season ENSO strength", desc:"Average ONI (El Niño index) across June–September, the core monsoon window", gain:7.1  },
  { name:"rainfall_deficit_pct", label:"Rainfall shortfall (%)",       desc:"How far actual rainfall fell below the district's 36-year historical average", gain:7.0  },
  { name:"effective_stress",     label:"Crop-weighted rainfall stress",desc:"Rainfall deficit adjusted for how rain-dependent the district's main crop is", gain:5.4  },
  { name:"enso_phase_enc",       label:"ENSO phase",                  desc:"Whether the year is classified El Niño, La Niña, or Neutral", gain:5.4  },
  { name:"oni_jjas_min",         label:"Weakest monsoon ENSO reading", desc:"The mildest El Niño / La Niña signal recorded during June–September", gain:5.3  },
];

export const ENSO_IOD_TABLE = [
  { enso:"El Niño", iod:"Negative IOD", stress:0.671, deficit:-16.7, n:136, color:"#dc2626" },
  { enso:"El Niño", iod:"Neutral IOD",  stress:0.594, deficit:-13.5, n:374, color:"#ea580c" },
  { enso:"El Niño", iod:"Positive IOD", stress:0.570, deficit:-17.3, n:68,  color:"#ca8a04" },
  { enso:"Neutral", iod:"Neutral IOD",  stress:0.316, deficit:-1.2,  n:408, color:"#64748b" },
  { enso:"La Niña", iod:"Neutral IOD",  stress:0.280, deficit:8.4,   n:374, color:"#0891b2" },
  { enso:"La Niña", iod:"Positive IOD", stress:0.211, deficit:14.2,  n:36,  color:"#16a34a" },
];

export const CV_RESULTS = {
  accuracy:0.947, accuracy_std:0.021,
  f1_weighted:0.947, f1_weighted_std:0.021,
  f1_macro:0.916, f1_macro_std:0.040,
  folds:[
    { zone:"Konkan",              acc:0.918, f1w:0.918, f1m:0.858 },
    { zone:"Marathwada",          acc:0.977, f1w:0.978, f1m:0.968 },
    { zone:"Vidarbha",            acc:0.948, f1w:0.947, f1m:0.930 },
    { zone:"Western Maharashtra", acc:0.943, f1w:0.943, f1m:0.907 },
  ],
};

export const ZONES = ["All zones","Vidarbha","Marathwada","Western Maharashtra","Konkan"];
export const CROPS = ["All crops","Cotton","Soybean","Rice","Sorghum","Sugarcane"];
