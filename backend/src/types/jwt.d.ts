import * as jwt from 'jsonwebtoken';

declare module 'jsonwebtoken' {
  export interface JwtPayload {
    userId: string;
    email: string;
    role: string;
  }
} 