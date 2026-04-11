import { describe, it, expect } from 'vitest';
import { Group, Object3D } from 'three';
import { cloneCar } from './Assets';
import type { AssetManifest } from './Assets';

describe('cloneCar', () => {
  it('returns a new Group instance, not the same reference', () => {
    const template = new Group();
    template.name = 'sedan';
    const clone = cloneCar(template);

    expect(clone).toBeInstanceOf(Group);
    expect(clone).not.toBe(template);
  });

  it('preserves the name of the template', () => {
    const template = new Group();
    template.name = 'taxi';
    const clone = cloneCar(template);

    expect(clone.name).toBe('taxi');
  });

  it('clones child objects without sharing references', () => {
    const template = new Group();
    const child = new Object3D();
    child.name = 'body';
    template.add(child);

    const clone = cloneCar(template);

    expect(clone.children).toHaveLength(1);
    expect(clone.children[0]).not.toBe(child);
    expect(clone.children[0].name).toBe('body');
  });

  it('preserves scale from the template', () => {
    const template = new Group();
    template.scale.set(2, 2, 2);
    const clone = cloneCar(template);

    expect(clone.scale.x).toBe(2);
    expect(clone.scale.y).toBe(2);
    expect(clone.scale.z).toBe(2);
  });
});

describe('AssetManifest type', () => {
  it('has all 9 car keys (compile-time check exercised at runtime)', () => {
    // This test verifies the type at compile time — if a key is missing from
    // AssetManifest, TypeScript will error here.  At runtime we just confirm
    // the keys array is the right length.
    const keys: (keyof AssetManifest)[] = [
      'sedan',
      'sedanSports',
      'truck',
      'van',
      'taxi',
      'suv',
      'delivery',
      'hatchbackSports',
      'police',
    ];
    expect(keys).toHaveLength(9);
  });
});
