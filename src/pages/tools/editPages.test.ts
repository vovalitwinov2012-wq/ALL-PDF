import { describe, expect, it } from 'vitest';
import { parseStampPages } from './EditPage';

describe('parseStampPages', () => {
  it('галочка — весь документ', () => {
    expect(parseStampPages('', true, 5)).toBe('all');
  });
  it('пустое поле — ошибка, а не весь документ', () => {
    expect(parseStampPages('', false, 5)).toBeNull();
    expect(parseStampPages('   ', false, 5)).toBeNull();
  });
  it('без известного числа страниц — ошибка', () => {
    expect(parseStampPages('2', false, null)).toBeNull();
  });
  it('валидный номер — индекс, мусор и выход за диапазон — ошибка', () => {
    expect(parseStampPages('2', false, 5)).toEqual([1]);
    expect(parseStampPages('0', false, 5)).toBeNull();
    expect(parseStampPages('6', false, 5)).toBeNull();
    expect(parseStampPages('abc', false, 5)).toBeNull();
  });
});
