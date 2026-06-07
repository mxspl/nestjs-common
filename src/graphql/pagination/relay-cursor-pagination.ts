import { BadRequestException } from '@nestjs/common';
import { Brackets, type Repository, type SelectQueryBuilder } from 'typeorm';

const DEFAULT_FIRST = 20;
const MAX_FIRST = 100;

type CursorPayload = {
  createdAt: string;
  id: string;
};

type CursorNode = {
  createdAt: Date;
  id: string;
};

type BuildConnectionInput<TNode extends CursorNode, TEdge> = {
  repository: Repository<TNode>;
  alias: string;
  first?: number;
  after?: string;
  toEdge: (node: TNode, cursor: string) => TEdge;
  configureQuery?: (queryBuilder: SelectQueryBuilder<TNode>) => void;
  getTotalCount?: () => Promise<number>;
};

type BuildConnectionResult<TEdge> = {
  edges: TEdge[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
  totalCount: number;
};

export async function buildRelayConnection<TNode extends CursorNode, TEdge>({
  repository,
  alias,
  first,
  after,
  toEdge,
  configureQuery,
  getTotalCount,
}: BuildConnectionInput<TNode, TEdge>): Promise<BuildConnectionResult<TEdge>> {
  const pageSize = normalizeFirst(first);
  const decodedAfterCursor = after ? decodeCursor(after) : null;

  const queryBuilder = repository.createQueryBuilder(alias);
  configureQuery?.(queryBuilder);

  if (decodedAfterCursor) {
    queryBuilder.andWhere(
      new Brackets((qb) => {
        qb.where(`${alias}.createdAt > :afterCreatedAt`, {
          afterCreatedAt: decodedAfterCursor.createdAt,
        }).orWhere(
          `${alias}.createdAt = :afterCreatedAt AND ${alias}.id > :afterId`,
          {
            afterCreatedAt: decodedAfterCursor.createdAt,
            afterId: decodedAfterCursor.id,
          },
        );
      }),
    );
  }

  queryBuilder
    .orderBy(`${alias}.createdAt`, 'ASC')
    .addOrderBy(`${alias}.id`, 'ASC')
    .take(pageSize + 1);

  const rows = await queryBuilder.getMany();
  const totalCount = getTotalCount
    ? await getTotalCount()
    : await repository.count();

  const hasNextPage = rows.length > pageSize;
  const nodes = hasNextPage ? rows.slice(0, pageSize) : rows;
  const edgesWithCursor = nodes.map((node) => {
    const cursor = encodeCursor({
      createdAt: node.createdAt.toISOString(),
      id: node.id,
    });

    return { cursor, edge: toEdge(node, cursor) };
  });
  const edges = edgesWithCursor.map(({ edge }) => edge);

  return {
    edges,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: Boolean(after),
      startCursor: edgesWithCursor[0]?.cursor ?? null,
      endCursor: edgesWithCursor.at(-1)?.cursor ?? null,
    },
    totalCount,
  };
}

function normalizeFirst(first?: number): number {
  if (!first) {
    return DEFAULT_FIRST;
  }

  if (!Number.isInteger(first) || first < 1) {
    throw new BadRequestException('"first" must be a positive integer.');
  }

  return Math.min(first, MAX_FIRST);
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function decodeCursor(cursor: string): CursorPayload {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64').toString('utf8'),
    ) as Partial<CursorPayload>;

    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new TypeError('Invalid cursor payload');
    }

    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException('Invalid "after" cursor.');
  }
}
