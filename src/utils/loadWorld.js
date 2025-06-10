import yaml from 'js-yaml';

export async function loadWorldYaml() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/islands.yml`);

    if (!res.ok) {
      console.error(`Failed to fetch YAML: ${res.status} ${res.statusText}`);
      return null;
    }

    const text = await res.text();
    const data = yaml.load(text);

    console.log('Loaded world YAML:', data); // ✅ check if "central" is present

    return data;
  } catch (err) {
    console.error('Error loading YAML:', err);
    return null;
  }
}
