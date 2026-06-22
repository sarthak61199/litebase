import { describe, it, expect } from 'vitest';
import { PgError, serializeError, deserializeError } from '../../../src/db/rpc/shared';

describe('serializeError', () => {
  it('serializes a PgError preserving all postgres fields', () => {
    const err = new PgError('duplicate key', {
      code: '23505',
      detail: 'Key (id)=(1) already exists.',
      hint: 'Check the id column.',
      position: '42',
    });
    const s = serializeError(err);
    expect(s.message).toBe('duplicate key');
    expect(s.name).toBe('PgError');
    expect(s.code).toBe('23505');
    expect(s.detail).toBe('Key (id)=(1) already exists.');
    expect(s.hint).toBe('Check the id column.');
    expect(s.position).toBe('42');
  });

  it('serializes a plain Error without postgres fields', () => {
    const err = new Error('something went wrong');
    const s = serializeError(err);
    expect(s.message).toBe('something went wrong');
    expect(s.name).toBe('Error');
    expect(s.code).toBeUndefined();
    expect(s.detail).toBeUndefined();
    expect(s.hint).toBeUndefined();
    expect(s.position).toBeUndefined();
  });

  it('normalizes a non-Error string value', () => {
    const s = serializeError('raw string error');
    expect(s.message).toBe('raw string error');
    expect(s.name).toBe('Error');
  });

  it('normalizes a non-Error number value', () => {
    const s = serializeError(42);
    expect(s.message).toBe('42');
    expect(s.name).toBe('Error');
  });

  it('normalizes null', () => {
    const s = serializeError(null);
    expect(s.message).toBe('null');
    expect(s.name).toBe('Error');
  });
});

describe('deserializeError', () => {
  it('round-trips a PgError preserving all postgres fields', () => {
    const original = new PgError('deadlock detected', {
      code: '40P01',
      detail: 'Process 123 waits for ShareLock.',
      hint: 'Retry the transaction.',
      position: '7',
    });
    const restored = deserializeError(serializeError(original));
    expect(restored).toBeInstanceOf(PgError);
    const pg = restored as PgError;
    expect(pg.message).toBe('deadlock detected');
    expect(pg.name).toBe('PgError');
    expect(pg.code).toBe('40P01');
    expect(pg.detail).toBe('Process 123 waits for ShareLock.');
    expect(pg.hint).toBe('Retry the transaction.');
    expect(pg.position).toBe('7');
  });

  it('round-trips a plain Error without crashing', () => {
    const original = new Error('network timeout');
    const restored = deserializeError(serializeError(original));
    expect(restored).toBeInstanceOf(Error);
    expect(restored).not.toBeInstanceOf(PgError);
    expect(restored.message).toBe('network timeout');
    expect(restored.name).toBe('Error');
  });

  it('round-trips a non-Error value as a plain Error', () => {
    const restored = deserializeError(serializeError('oops'));
    expect(restored).toBeInstanceOf(Error);
    expect(restored.message).toBe('oops');
  });

  it('restores a PgError when name is PgError even without pg fields', () => {
    const restored = deserializeError({ message: 'pg err', name: 'PgError' });
    expect(restored).toBeInstanceOf(PgError);
  });

  it('restores a PgError when any pg field is present', () => {
    const restored = deserializeError({ message: 'syntax error', name: 'Error', code: '42601' });
    expect(restored).toBeInstanceOf(PgError);
    expect((restored as PgError).code).toBe('42601');
  });

  it('preserves stack on round-trip', () => {
    const original = new Error('with stack');
    const restored = deserializeError(serializeError(original));
    expect(restored.stack).toBe(original.stack);
  });
});
