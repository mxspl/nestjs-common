import { BadRequestException } from '@nestjs/common';
import type { SelectQueryBuilder } from 'typeorm';
import { applyGraphqlFilters } from './filter-engine';

type QueryBuilderMock = {
  andWhere: jest.Mock;
};

function createQueryBuilder(): QueryBuilderMock {
  return {
    andWhere: jest.fn(),
  };
}

function applyFilters(
  queryBuilder: QueryBuilderMock,
  filters: unknown,
  fieldTypes: Record<string, 'string' | 'boolean' | 'number' | 'date'>,
): void {
  (
    applyGraphqlFilters as unknown as (
      queryBuilder: SelectQueryBuilder<{ id: string }>,
      alias: string,
      filters: Record<string, unknown> | undefined,
      fieldTypes: Record<string, 'string' | 'boolean' | 'number' | 'date'>,
    ) => void
  )(
    queryBuilder as unknown as SelectQueryBuilder<{ id: string }>,
    'entity',
    filters as Record<string, unknown> | undefined,
    fieldTypes,
  );
}

describe('applyGraphqlFilters', () => {
  it('should skip query changes when filters is undefined', () => {
    const queryBuilder = createQueryBuilder();

    applyFilters(queryBuilder, undefined, { id: 'string' });

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
  });

  it('should apply all supported string operators and logical groups', () => {
    const queryBuilder = createQueryBuilder();

    applyFilters(
      queryBuilder,
      {
        id: {
          eq: 'eq',
          eqi: 'eqi',
          ne: 'ne',
          nei: 'nei',
          lt: 'lt',
          lte: 'lte',
          gt: 'gt',
          gte: 'gte',
          in: ['in-1', 'in-2'],
          notIn: ['not-in-1'],
          contains: 'contains',
          notContains: 'notContains',
          containsi: 'containsi',
          notContainsi: 'notContainsi',
          null: true,
          notNull: true,
          between: ['between-a', 'between-b'],
          startsWith: 'starts',
          endsWith: 'ends',
        },
        and: [{ id: { eq: 'and-value' } }],
        or: [{ id: { eq: 'or-1' } }, { id: { eq: 'or-2' } }],
        not: [{ id: { eq: 'not-value' } }],
      },
      { id: 'string' },
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(1);

    const [whereSql, params] = queryBuilder.andWhere.mock.calls[0];

    expect(whereSql).toContain('entity.id = :');
    expect(whereSql).toContain('LOWER(entity.id) = LOWER(:');
    expect(whereSql).toContain('entity.id <> :');
    expect(whereSql).toContain('LOWER(entity.id) <> LOWER(:');
    expect(whereSql).toContain('entity.id < :');
    expect(whereSql).toContain('entity.id <= :');
    expect(whereSql).toContain('entity.id > :');
    expect(whereSql).toContain('entity.id >= :');
    expect(whereSql).toContain('entity.id IN (:...');
    expect(whereSql).toContain('entity.id NOT IN (:...');
    expect(whereSql).toContain('entity.id LIKE :');
    expect(whereSql).toContain('entity.id NOT LIKE :');
    expect(whereSql).toContain('entity.id ILIKE :');
    expect(whereSql).toContain('entity.id NOT ILIKE :');
    expect(whereSql).toContain('entity.id IS NULL');
    expect(whereSql).toContain('entity.id IS NOT NULL');
    expect(whereSql).toContain('entity.id BETWEEN :');
    expect(whereSql).toContain(' AND ');
    expect(whereSql).toContain(' OR ');
    expect(whereSql).toContain('NOT');
    expect(params).toMatchObject({
      filter_0: 'eq',
      filter_1: 'eqi',
      filter_2: 'ne',
      filter_3: 'nei',
      filter_4: 'lt',
      filter_5: 'lte',
      filter_6: 'gt',
      filter_7: 'gte',
      filter_8: ['in-1', 'in-2'],
      filter_9: ['not-in-1'],
      filter_10: '%contains%',
      filter_11: '%notContains%',
      filter_12: '%containsi%',
      filter_13: '%notContainsi%',
      filter_14: 'between-a',
      filter_15: 'between-b',
      filter_16: 'starts%',
      filter_17: '%ends',
      filter_18: 'and-value',
      filter_19: 'or-1',
      filter_20: 'or-2',
      filter_21: 'not-value',
    });
  });

  it('should apply supported boolean operators', () => {
    const queryBuilder = createQueryBuilder();

    applyFilters(
      queryBuilder,
      {
        active: {
          eq: true,
          ne: false,
          in: [true],
          notIn: [false],
          null: true,
          notNull: true,
        },
      },
      { active: 'boolean' },
    );

    const [whereSql, params] = queryBuilder.andWhere.mock.calls[0];

    expect(whereSql).toContain('entity.active = :');
    expect(whereSql).toContain('entity.active <> :');
    expect(whereSql).toContain('entity.active IN (:...');
    expect(whereSql).toContain('entity.active NOT IN (:...');
    expect(whereSql).toContain('entity.active IS NULL');
    expect(whereSql).toContain('entity.active IS NOT NULL');
    expect(params).toMatchObject({
      filter_0: true,
      filter_1: false,
      filter_2: [true],
      filter_3: [false],
    });
  });

  it('should skip empty expressions', () => {
    const queryBuilder = createQueryBuilder();

    applyFilters(
      queryBuilder,
      {
        id: { null: false, notNull: false },
        and: [{}],
        not: [{}],
      },
      { id: 'string' },
    );

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
  });

  it('should throw for invalid root filter object', () => {
    const queryBuilder = createQueryBuilder();

    expect(() =>
      applyFilters(queryBuilder, 'invalid', { id: 'string' }),
    ).toThrow(new BadRequestException('Invalid filter object.'));
  });

  it('should throw for unknown field', () => {
    const queryBuilder = createQueryBuilder();

    expect(() =>
      applyFilters(queryBuilder, { email: { eq: 'a' } }, { id: 'string' }),
    ).toThrow(new BadRequestException('Unknown filter field: email'));
  });

  it('should throw when field filter is not an operator object', () => {
    const queryBuilder = createQueryBuilder();

    expect(() =>
      applyFilters(queryBuilder, { id: 'invalid' }, { id: 'string' }),
    ).toThrow(
      new BadRequestException(
        'Filter field "id" must be an object of operators.',
      ),
    );
  });

  it.each([
    ['and', { and: {} }],
    ['or', { or: {} }],
    ['not', { not: {} }],
  ])('should throw when %s is not an array', (_name, filters) => {
    const queryBuilder = createQueryBuilder();

    expect(() => applyFilters(queryBuilder, filters, { id: 'string' })).toThrow(
      BadRequestException,
    );
  });

  it.each([
    [{ id: { in: 'invalid' } }, 'Operator "in" expects an array value.'],
    [{ id: { notIn: 'invalid' } }, 'Operator "notIn" expects an array value.'],
    [
      { id: { between: ['a'] } },
      'Operator "between" expects a two-value array.',
    ],
    [{ id: { unsupported: 'x' } }, 'Unsupported operator: unsupported'],
  ])('should throw for invalid operators', (filters, message) => {
    const queryBuilder = createQueryBuilder();

    expect(() => applyFilters(queryBuilder, filters, { id: 'string' })).toThrow(
      new BadRequestException(message),
    );
  });

  it('should throw for string-only operator on non-string fields', () => {
    const queryBuilder = createQueryBuilder();

    expect(() =>
      applyFilters(
        queryBuilder,
        { active: { contains: 'x' } },
        { active: 'boolean' },
      ),
    ).toThrow(
      new BadRequestException(
        'Operator "contains" only supports string fields.',
      ),
    );
  });

  it('should handle empty in and notIn arrays', () => {
    const queryBuilder = createQueryBuilder();

    applyFilters(queryBuilder, { id: { in: [], notIn: [] } }, { id: 'string' });

    const [whereSql] = queryBuilder.andWhere.mock.calls[0];

    expect(whereSql).toContain('(1 = 0)');
    expect(whereSql).toContain('(1 = 1)');
  });
});
