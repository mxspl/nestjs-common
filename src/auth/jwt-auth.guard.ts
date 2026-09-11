import {
  type CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(
    context: ExecutionContext,
  ): ReturnType<CanActivate['canActivate']> {
    if (
      context.getType<GqlContextType>() !== 'graphql' &&
      context.getType() === 'http'
    ) {
      const request = context.switchToHttp().getRequest();
      if (request?.path !== '/graphql') {
        return true;
      }
    }

    return super.canActivate(context);
  }

  getRequest(context: ExecutionContext) {
    const graphqlContext = GqlExecutionContext.create(context).getContext();
    if (graphqlContext?.req) {
      return graphqlContext.req;
    }
    if (graphqlContext?.headers) {
      return graphqlContext;
    }
    return context.switchToHttp().getRequest();
  }
}