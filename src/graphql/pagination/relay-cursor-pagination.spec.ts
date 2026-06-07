import { BadRequestException } from '@nestjs/common';
import { Brackets, type Repository } from 'typeorm';
import { buildRelayConnection } from './relay-cursor-pagination';

type NodeRow = {
  id: string;
  createdAt: Date;
};

type EdgeRow = {
  cursor: string;
  node: NodeRow;
};

type QueryBuilderMock = {
  where: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  take: jest.Mock;
  andWhere: jest.Mock;
  getMany: jest.Mock;
};

describe('buildRelayConnection', () => {
  let repository: {
    createQueryBuilder: jest.Mock;
    count: jest.Mock;
  };
  let queryBuilder: QueryBuilderMock;

  beforeEach(() => {
    queryBuilder = {
      where: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      take: jest.fn(),
      andWhere: jest.fn(),
      getMany: jest.fn(),
    };

    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    queryBuilder.addOrderBy.mockReturnValue(queryBuilder);
    queryBuilder.take.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);

    repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      count: jest.fn(),
    };
  });

  it('should use default page size when first is not provided', async () => {
    queryBuilder.getMany.mockResolvedValue([]);
    repository.count.mockResolvedValue(0);

    const result = await buildRelayConnection<NodeRow, EdgeRow>({
      repository: repository as unknown as Repository<NodeRow>,
      alias: 'node',
      toEdge: (node, cursor) => ({ node, cursor }),
    });

    expect(queryBuilder.take).toHaveBeenCalledWith(21);
    expect(result.edges).toEqual([]);
    expect(result.pageInfo.startCursor).toBeNull();
    expect(result.pageInfo.endCursor).toBeNull();
    expect(result.pageInfo.hasPreviousPage).toBe(false);
  });

  it('should apply after cursor filter and build where bracket predicates', async () => {
    const after = Buffer.from(
      JSON.stringify({ id: 'n-1', createdAt: '2026-05-01T00:00:00.000Z' }),
    ).toString('base64');
    queryBuilder.getMany.mockResolvedValue([]);
    repository.count.mockResolvedValue(0);

    const result = await buildRelayConnection<NodeRow, EdgeRow>({
      repository: repository as unknown as Repository<NodeRow>,
      alias: 'node',
      first: 10,
      after,
      toEdge: (node, cursor) => ({ node, cursor }),
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(1);
    const bracketsArg = queryBuilder.andWhere.mock.calls[0][0] as Brackets;
    expect(bracketsArg).toBeInstanceOf(Brackets);

    const orWhere = jest.fn();
    const where = jest.fn().mockReturnValue({ orWhere });

    (
      bracketsArg as unknown as {
        whereFactory: (qb: { where: jest.Mock }) => void;
      }
    ).whereFactory({ where });

    expect(where).toHaveBeenCalledWith('node.createdAt > :afterCreatedAt', {
      afterCreatedAt: '2026-05-01T00:00:00.000Z',
    });
    expect(orWhere).toHaveBeenCalledWith(
      'node.createdAt = :afterCreatedAt AND node.id > :afterId',
      {
        afterCreatedAt: '2026-05-01T00:00:00.000Z',
        afterId: 'n-1',
      },
    );
    expect(result.pageInfo.hasPreviousPage).toBe(true);
  });

  it('should cap first to max and mark hasNextPage when extra rows exist', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      id: `n-${index + 1}`,
      createdAt: new Date(
        `2026-05-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      ),
    }));
    queryBuilder.getMany.mockResolvedValue(rows);
    repository.count.mockResolvedValue(500);

    const result = await buildRelayConnection<NodeRow, EdgeRow>({
      repository: repository as unknown as Repository<NodeRow>,
      alias: 'node',
      first: 1000,
      toEdge: (node, cursor) => ({ node, cursor }),
    });

    expect(queryBuilder.take).toHaveBeenCalledWith(101);
    expect(result.edges).toHaveLength(100);
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.totalCount).toBe(500);
  });

  it('should throw when first is invalid', async () => {
    await expect(
      buildRelayConnection<NodeRow, EdgeRow>({
        repository: repository as unknown as Repository<NodeRow>,
        alias: 'node',
        first: -1,
        toEdge: (node, cursor) => ({ node, cursor }),
      }),
    ).rejects.toThrow(BadRequestException);

    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('should throw when decoded cursor payload is invalid', async () => {
    const badPayloadCursor = Buffer.from(
      JSON.stringify({ foo: 'bar' }),
    ).toString('base64');

    await expect(
      buildRelayConnection<NodeRow, EdgeRow>({
        repository: repository as unknown as Repository<NodeRow>,
        alias: 'node',
        after: badPayloadCursor,
        toEdge: (node, cursor) => ({ node, cursor }),
      }),
    ).rejects.toThrow('Invalid "after" cursor.');
  });

  it('should apply custom query configuration and scoped total count', async () => {
    queryBuilder.getMany.mockResolvedValue([
      {
        id: 'n-1',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);

    const getTotalCount = jest.fn().mockResolvedValue(3);

    const result = await buildRelayConnection<NodeRow, EdgeRow>({
      repository: repository as unknown as Repository<NodeRow>,
      alias: 'node',
      configureQuery: (builder) => {
        builder.where('node.ownerId = :ownerId', { ownerId: 'user-1' });
      },
      getTotalCount,
      toEdge: (node, cursor) => ({ node, cursor }),
    });

    expect(queryBuilder.where).toHaveBeenCalledWith('node.ownerId = :ownerId', {
      ownerId: 'user-1',
    });
    expect(getTotalCount).toHaveBeenCalledTimes(1);
    expect(repository.count).not.toHaveBeenCalled();
    expect(result.totalCount).toBe(3);
  });
});
