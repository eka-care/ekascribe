import type { IApiOrigin } from '../contracts';

/**
 * Web API origin — always same-origin. The static bundle is served by the FastAPI app
 * that also owns the backend routes, so relative paths resolve correctly on any domain.
 */
export class ApiOriginWebImpl implements IApiOrigin {
  get(): string {
    return '';
  }
}

export const apiOriginWeb: IApiOrigin = new ApiOriginWebImpl();
