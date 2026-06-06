import { BadRequestException } from '@nestjs/common';
import { type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';

export type GraphqlFilterFieldType = 'string' | 'boolean' | 'number' | 'date';

export type GraphqlLogicalFilterNode<TNode> = {
  and?: TNode[];
  or?: TNode[];
  not?: TNode[];
};

type BuildContext = {
  alias: string;
  fieldTypes: Record<string, GraphqlFilterFieldType>;
  index: number;
  params: Record<string, unknown>;
};

export function applyGraphqlFilters<
  T extends ObjectLiteral,
>(
  queryBuilder: SelectQueryBuilder<T>,
  alias: string,
  filters: Record<string, unknown> | undefined,
  fieldTypes: Record<string, GraphqlFilterFieldType>,
): void {
  if (!filters) {
    return;
  }

  const context: BuildContext = {
    alias,
    fieldTypes,
    index: 0,
    params: {},
  };

  const where = buildNodeExpression(filters, context);

  if (where) {
    queryBuilder.andWhere(where, context.params);
  }
}

function buildNodeExpression(node: unknown, context: BuildContext): string {
  if (!isObject(node)) {
    throw new BadRequestException('Invalid filter object.');
  }

  const expressions: string[] = [];

  for (const [key, value] of Object.entries(node)) {
    if (key === 'and' || key === 'or' || key === 'not') {
      continue;
    }

    if (!(key in context.fieldTypes)) {
      throw new BadRequestException(`Unknown filter field: ${key}`);
    }

    if (!isObject(value)) {
      throw new BadRequestException(
        `Filter field "${key}" must be an object of operators.`,
      );
    }

    const fieldExpression = buildFieldExpression(key, value, context);
    if (fieldExpression) {
      expressions.push(fieldExpression);
    }
  }

  const logicalNode = node as GraphqlLogicalFilterNode<unknown>;

  const andExpression = buildLogicalGroup(logicalNode.and, 'AND', context);
  if (andExpression) {
    expressions.push(andExpression);
  }

  const orExpression = buildLogicalGroup(logicalNode.or, 'OR', context);
  if (orExpression) {
    expressions.push(orExpression);
  }

  const notExpression = buildNotGroup(logicalNode.not, context);
  if (notExpression) {
    expressions.push(notExpression);
  }

  if (expressions.length === 0) {
    return '';
  }

  return `(${expressions.join(' AND ')})`;
}

function buildLogicalGroup(
  filters: unknown,
  joinOperator: 'AND' | 'OR',
  context: BuildContext,
): string {
  if (!filters) {
    return '';
  }

  if (!Array.isArray(filters)) {
    throw new BadRequestException(
      `Logical operator "${joinOperator.toLowerCase()}" must be an array.`,
    );
  }

  const children = filters
    .map((entry) => buildNodeExpression(entry, context))
    .filter(Boolean);

  if (children.length === 0) {
    return '';
  }

  return `(${children.join(` ${joinOperator} `)})`;
}

function buildNotGroup(filters: unknown, context: BuildContext): string {
  if (!filters) {
    return '';
  }

  if (!Array.isArray(filters)) {
    throw new BadRequestException('Logical operator "not" must be an array.');
  }

  const children = filters
    .map((entry) => buildNodeExpression(entry, context))
    .filter(Boolean)
    .map((entry) => `(NOT ${entry})`);

  if (children.length === 0) {
    return '';
  }

  return `(${children.join(' AND ')})`;
}

function buildFieldExpression(
  field: string,
  operators: Record<string, unknown>,
  context: BuildContext,
): string {
  const column = `${context.alias}.${field}`;
  const fieldType = context.fieldTypes[field];
  const expressions: string[] = [];

  for (const [operator, value] of Object.entries(operators)) {
    const expression = buildOperatorExpression(
      column,
      fieldType,
      operator,
      value,
      context,
    );

    if (expression) {
      expressions.push(expression);
    }
  }

  if (expressions.length === 0) {
    return '';
  }

  return `(${expressions.join(' AND ')})`;
}

function buildOperatorExpression(
  column: string,
  fieldType: GraphqlFilterFieldType,
  operator: string,
  value: unknown,
  context: BuildContext,
): string {
  switch (operator) {
    case 'eq': {
      const param = setParam(context, value);
      return `${column} = :${param}`;
    }
    case 'eqi': {
      requireStringType(operator, fieldType);
      const param = setParam(context, value);
      return `LOWER(${column}) = LOWER(:${param})`;
    }
    case 'ne': {
      const param = setParam(context, value);
      return `${column} <> :${param}`;
    }
    case 'nei': {
      requireStringType(operator, fieldType);
      const param = setParam(context, value);
      return `LOWER(${column}) <> LOWER(:${param})`;
    }
    case 'lt': {
      const param = setParam(context, value);
      return `${column} < :${param}`;
    }
    case 'lte': {
      const param = setParam(context, value);
      return `${column} <= :${param}`;
    }
    case 'gt': {
      const param = setParam(context, value);
      return `${column} > :${param}`;
    }
    case 'gte': {
      const param = setParam(context, value);
      return `${column} >= :${param}`;
    }
    case 'in': {
      if (!Array.isArray(value)) {
        throw new BadRequestException('Operator "in" expects an array value.');
      }

      if (value.length === 0) {
        return '(1 = 0)';
      }

      const param = setParam(context, value);
      return `${column} IN (:...${param})`;
    }
    case 'notIn': {
      if (!Array.isArray(value)) {
        throw new BadRequestException(
          'Operator "notIn" expects an array value.',
        );
      }

      if (value.length === 0) {
        return '(1 = 1)';
      }

      const param = setParam(context, value);
      return `${column} NOT IN (:...${param})`;
    }
    case 'contains': {
      requireStringType(operator, fieldType);
      const param = setParam(context, `%${String(value)}%`);
      return `${column} LIKE :${param}`;
    }
    case 'notContains': {
      requireStringType(operator, fieldType);
      const param = setParam(context, `%${String(value)}%`);
      return `${column} NOT LIKE :${param}`;
    }
    case 'containsi': {
      requireStringType(operator, fieldType);
      const param = setParam(context, `%${String(value)}%`);
      return `${column} ILIKE :${param}`;
    }
    case 'notContainsi': {
      requireStringType(operator, fieldType);
      const param = setParam(context, `%${String(value)}%`);
      return `${column} NOT ILIKE :${param}`;
    }
    case 'null': {
      return value ? `${column} IS NULL` : '';
    }
    case 'notNull': {
      return value ? `${column} IS NOT NULL` : '';
    }
    case 'between': {
      if (!Array.isArray(value) || value.length !== 2) {
        throw new BadRequestException(
          'Operator "between" expects a two-value array.',
        );
      }

      const lowerParam = setParam(context, value[0]);
      const upperParam = setParam(context, value[1]);
      return `${column} BETWEEN :${lowerParam} AND :${upperParam}`;
    }
    case 'startsWith': {
      requireStringType(operator, fieldType);
      const param = setParam(context, `${String(value)}%`);
      return `${column} LIKE :${param}`;
    }
    case 'endsWith': {
      requireStringType(operator, fieldType);
      const param = setParam(context, `%${String(value)}`);
      return `${column} LIKE :${param}`;
    }
    default:
      throw new BadRequestException(`Unsupported operator: ${operator}`);
  }
}

function setParam(context: BuildContext, value: unknown): string {
  const name = `filter_${context.index++}`;
  context.params[name] = value;
  return name;
}

function requireStringType(operator: string, fieldType: GraphqlFilterFieldType): void {
  if (fieldType !== 'string') {
    throw new BadRequestException(
      `Operator "${operator}" only supports string fields.`,
    );
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}