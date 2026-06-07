import type { Type } from '@nestjs/common';
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('PageInfo')
export class RelayPageInfo {
  @Field(() => Boolean)
  hasNextPage!: boolean;

  @Field(() => Boolean)
  hasPreviousPage!: boolean;

  @Field(() => String, { nullable: true })
  startCursor!: string | null;

  @Field(() => String, { nullable: true })
  endCursor!: string | null;
}

export function RelayEdgeType<TNode>(nodeType: Type<TNode>) {
  @ObjectType({ isAbstract: true })
  abstract class RelayEdgeClass {
    @Field(() => String)
    cursor!: string;

    @Field(() => nodeType)
    node!: TNode;
  }

  return RelayEdgeClass;
}

export function RelayConnectionType<TEdge>(edgeType: Type<TEdge>) {
  @ObjectType({ isAbstract: true })
  abstract class RelayConnectionClass {
    @Field(() => [edgeType])
    edges!: TEdge[];

    @Field(() => RelayPageInfo)
    pageInfo!: RelayPageInfo;

    @Field(() => Int)
    totalCount!: number;
  }

  return RelayConnectionClass;
}
