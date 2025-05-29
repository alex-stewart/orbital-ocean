import yaml from 'js-yaml';

export async function loadWorldYaml(path = '/data/islands.yml') {
  const res = await fetch(path);
  const text = await res.text();
  const world = yaml.load(text);
  return world;
}
