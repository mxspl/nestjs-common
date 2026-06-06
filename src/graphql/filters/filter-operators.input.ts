import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class StringFilterOperatorsInput {
  @Field(() => String, { nullable: true })
  eq?: string;

  @Field(() => String, { nullable: true })
  eqi?: string;

  @Field(() => String, { nullable: true })
  ne?: string;

  @Field(() => String, { nullable: true })
  nei?: string;

  @Field(() => String, { nullable: true })
  lt?: string;

  @Field(() => String, { nullable: true })
  lte?: string;

  @Field(() => String, { nullable: true })
  gt?: string;

  @Field(() => String, { nullable: true })
  gte?: string;

  @Field(() => [String], { nullable: true })
  in?: string[];

  @Field(() => [String], { nullable: true })
  notIn?: string[];

  @Field(() => String, { nullable: true })
  contains?: string;

  @Field(() => String, { nullable: true })
  notContains?: string;

  @Field(() => String, { nullable: true })
  containsi?: string;

  @Field(() => String, { nullable: true })
  notContainsi?: string;

  @Field(() => Boolean, { nullable: true })
  null?: boolean;

  @Field(() => Boolean, { nullable: true })
  notNull?: boolean;

  @Field(() => [String], { nullable: true })
  between?: string[];

  @Field(() => String, { nullable: true })
  startsWith?: string;

  @Field(() => String, { nullable: true })
  endsWith?: string;
}

@InputType()
export class BooleanFilterOperatorsInput {
  @Field(() => Boolean, { nullable: true })
  eq?: boolean;

  @Field(() => Boolean, { nullable: true })
  ne?: boolean;

  @Field(() => [Boolean], { nullable: true })
  in?: boolean[];

  @Field(() => [Boolean], { nullable: true })
  notIn?: boolean[];

  @Field(() => Boolean, { nullable: true })
  null?: boolean;

  @Field(() => Boolean, { nullable: true })
  notNull?: boolean;
}