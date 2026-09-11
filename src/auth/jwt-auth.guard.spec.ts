import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow non-graphql HTTP requests that are not targeting /graphql', () => {
    const mockContext = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ path: '/health' }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should authenticate GraphQL requests', () => {
    const canActivate = vi.spyOn(
      Object.getPrototypeOf(Object.getPrototypeOf(guard)),
      'canActivate',
    );
    canActivate.mockReturnValue(true);

    const mockContext = {
      getType: () => 'graphql',
    } as unknown as ExecutionContext;

    expect(guard.canActivate(mockContext)).toBe(true);
    expect(canActivate).toHaveBeenCalledWith(mockContext);
  });

  it('should authenticate HTTP requests targeting GraphQL', () => {
    const canActivate = vi.spyOn(
      Object.getPrototypeOf(Object.getPrototypeOf(guard)),
      'canActivate',
    );
    canActivate.mockReturnValue(true);

    const mockContext = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ path: '/graphql' }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should extract request correctly from GraphQL context', () => {
    const mockRequest = { headers: { authorization: 'Bearer token' } };
    const mockContext = {
      getHandler: () => {},
      getClass: () => {},
      getType: () => 'graphql',
      getArgs: () => [{}, {}, { req: mockRequest }, {}],
    } as unknown as ExecutionContext;

    expect(guard.getRequest(mockContext)).toBe(mockRequest);
  });

  it('should extract GraphQL context when it contains headers', () => {
    const graphqlContext = { headers: { authorization: 'Bearer token' } };
    const mockContext = {
      getType: () => 'graphql',
      getClass: () => {},
      getHandler: () => {},
      getArgs: () => [{}, {}, graphqlContext, {}],
    } as unknown as ExecutionContext;

    expect(guard.getRequest(mockContext)).toBe(graphqlContext);
  });

  it('should extract the HTTP request when no GraphQL context exists', () => {
    const mockRequest = { path: '/graphql' };
    const mockContext = {
      getType: () => 'http',
      getClass: () => {},
      getHandler: () => {},
      getArgs: () => [{}, {}, undefined, {}],
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;

    expect(guard.getRequest(mockContext)).toBe(mockRequest);
  });

  it('should extract the HTTP request when GraphQL context has no request data', () => {
    const mockRequest = { path: '/graphql' };
    const mockContext = {
      getType: () => 'http',
      getClass: () => {},
      getHandler: () => {},
      getArgs: () => [{}, {}, {}, {}],
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;

    expect(guard.getRequest(mockContext)).toBe(mockRequest);
  });
});