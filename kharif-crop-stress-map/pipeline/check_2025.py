import pandas as pd
df = pd.read_parquet('data/processed/predictions_all_years.parquet')
print("Years in parquet:", sorted(df['year'].unique()))
print("Latest year:", df['year'].max())

latest = df[df.year == df.year.max()].sort_values('composite_stress_score', ascending=False)
cols = ['district','ml_risk_label','composite_stress_score','rainfall_deficit_pct',
        'prob_critical','prob_high','prob_moderate','prob_low']
print(latest[cols].to_string(index=False))