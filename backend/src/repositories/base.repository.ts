/**
 * Minimal structural shape every Prisma model delegate satisfies for the
 * handful of operations this class wraps (`prisma.personne`, `prisma.famille`,
 * ...). Declared narrowly here instead of importing Prisma's own generated
 * delegate type, which carries far more (extension args, aggregate/groupBy
 * overloads, `select`/`include`/`omit`, ...) than this class needs and whose
 * exact shape can change across Prisma versions — any real Prisma delegate
 * structurally satisfies this interface for the methods listed.
 */
export interface PrismaCrudDelegate<
  TModel,
  TWhereUniqueInput,
  TWhereInput,
  TCreateInput,
  TUpdateInput,
  TOrderByInput = unknown,
> {
  create(args: { data: TCreateInput }): Promise<TModel>;
  findUnique(args: { where: TWhereUniqueInput }): Promise<TModel | null>;
  findFirst(args: { where?: TWhereInput }): Promise<TModel | null>;
  findMany(args?: {
    where?: TWhereInput;
    skip?: number;
    take?: number;
    orderBy?: TOrderByInput;
  }): Promise<TModel[]>;
  update(args: { where: TWhereUniqueInput; data: TUpdateInput }): Promise<TModel>;
  count(args?: { where?: TWhereInput }): Promise<number>;
}

export interface FindAllParams<TWhereInput, TOrderByInput = unknown> {
  where?: TWhereInput;
  skip?: number;
  take?: number;
  orderBy?: TOrderByInput;
}

/**
 * Generic CRUD wrapper around one Prisma delegate. The 9 operations required
 * of every repository (create/findById/findOne/findAll/update/softDelete/
 * restore/exists/count) live here exactly once; a business repository
 * (`PersonneRepository extends SoftDeletableRepository`, etc.) only adds the
 * domain-specific queries that don't fit this generic shape (e.g. "find by
 * family", "find children of a father") — it never re-implements the 9 above.
 *
 * No business rules here (uniqueness checks, cascades, ...) — those belong in
 * services. This class only knows how to talk to one Prisma delegate.
 */
export class BaseRepository<
  TModel,
  TWhereUniqueInput,
  TWhereInput,
  TCreateInput,
  TUpdateInput,
  TOrderByInput = unknown,
> {
  constructor(
    protected readonly delegate: PrismaCrudDelegate<
      TModel,
      TWhereUniqueInput,
      TWhereInput,
      TCreateInput,
      TUpdateInput,
      TOrderByInput
    >,
  ) {}

  create(data: TCreateInput): Promise<TModel> {
    return this.delegate.create({ data });
  }

  findById(where: TWhereUniqueInput): Promise<TModel | null> {
    return this.delegate.findUnique({ where });
  }

  findOne(where: TWhereInput): Promise<TModel | null> {
    return this.delegate.findFirst({ where });
  }

  findAll(params: FindAllParams<TWhereInput, TOrderByInput> = {}): Promise<TModel[]> {
    return this.delegate.findMany(params);
  }

  update(where: TWhereUniqueInput, data: TUpdateInput): Promise<TModel> {
    return this.delegate.update({ where, data });
  }

  async exists(where: TWhereInput): Promise<boolean> {
    const total = await this.delegate.count({ where });
    return total > 0;
  }

  count(where?: TWhereInput): Promise<number> {
    // `exactOptionalPropertyTypes` treats "key present with an `undefined`
    // value" as distinct from "key absent" — the delegate's optional `where`
    // must genuinely be omitted, not passed as `{ where: undefined }`.
    return where === undefined ? this.delegate.count() : this.delegate.count({ where });
  }
}

/**
 * Extends BaseRepository with the logical-deletion pair every non-pivot table
 * in this project uses: a nullable `deletedAt` column (see the "models"
 * phase report for why). Only repositories whose model actually declares
 * `deletedAt` should extend this instead of the plain `BaseRepository`.
 */
export class SoftDeletableRepository<
  TModel,
  TWhereUniqueInput,
  TWhereInput,
  TCreateInput,
  // `unknown`, not `Date | null`: Prisma's generated `*UpdateInput` types allow
  // richer "field update operations" for a nullable DateTime (e.g. a wrapper
  // object), not just a plain value — the constraint only needs the key to
  // exist; the `as TUpdateInput` casts below are what actually assign it.
  TUpdateInput extends { deletedAt?: unknown },
  TOrderByInput = unknown,
> extends BaseRepository<
  TModel,
  TWhereUniqueInput,
  TWhereInput,
  TCreateInput,
  TUpdateInput,
  TOrderByInput
> {
  softDelete(where: TWhereUniqueInput): Promise<TModel> {
    return this.update(where, { deletedAt: new Date() } as TUpdateInput);
  }

  restore(where: TWhereUniqueInput): Promise<TModel> {
    return this.update(where, { deletedAt: null } as TUpdateInput);
  }
}
