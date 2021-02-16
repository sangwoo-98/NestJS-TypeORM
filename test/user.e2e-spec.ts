import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '../src/entities/user.entity';
import { UserCreateDto } from '../src/user/dtos/create-user.dto';
import { UserModule } from '../src/user/user.module';
import { UserService } from '../src/user/user.service';
import { Repository } from 'typeorm';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValidationPipe } from '@nestjs/common';
import { generateAccessToken } from '../src/utils/auth/jwt-token-util';
import { UserUpdateDto } from '../src/user/dtos/update-user.dto';

describe('UserController (e2e)', () => {
  let userService: UserService;
  let userRepository: Repository<User>;
  let app: INestApplication;
  const NAME = 'NAME';
  const EMAIL = 'test@test.com';
  const PASSWORD = '12345asbcd';
  const WRONG_TOKEN = 'asdfasdf';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        UserModule,

        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [User],
          logging: false,
          synchronize: true,
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    userRepository = moduleFixture.get('UserRepository');
    userService = new UserService(userRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await userRepository.query('DELETE FROM users');
  });

  it('[POST] /user : Response is OK if conditions are right', async () => {
    const dto = new UserCreateDto();
    dto.name = NAME;
    dto.email = EMAIL;
    dto.password = PASSWORD;
    const result = await request(app.getHttpServer())
      .post('/user')
      .send(dto)
      .expect(HttpStatus.CREATED);

    const userId = (await userRepository.findOne()).getUser_id;
    expect(JSON.stringify(result.body)).toBe(
      JSON.stringify(
        await userService.getUserInfo(userId, generateAccessToken(userId)),
      ),
    );
  });

  it('[POST] /user: Response is BAD_REQUEST if email is missing', async () => {
    const dto = new UserCreateDto();
    dto.name = NAME;
    dto.password = PASSWORD;
    const result = await request(app.getHttpServer()).post('/user').send(dto);
    expect(result.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('[POST] /user: Response is BAD_REQUEST if name is missing', async () => {
    const dto = new UserCreateDto();
    dto.email = EMAIL;
    dto.password = PASSWORD;
    const result = await request(app.getHttpServer()).post('/user').send(dto);
    expect(result.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('[POST] /user: Response is BAD_REQUEST if password is missing', async () => {
    const dto = new UserCreateDto();
    dto.email = EMAIL;
    dto.name = NAME;
    const result = await request(app.getHttpServer()).post('/user').send(dto);
    expect(result.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('[POST] /user: Response is BAD_REQUEST if email is not type of email', async () => {
    const dto = new UserCreateDto();
    dto.email = 'NOT_FORM_OF_EMAIL';
    dto.name = NAME;
    dto.password = PASSWORD;
    const result = await request(app.getHttpServer()).post('/user').send(dto);
    expect(result.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('[POST] /user: Response is CONFLICT if email already exists.', async () => {
    const savedUser = new User();
    savedUser.setEmail = EMAIL;
    savedUser.setName = NAME;
    savedUser.setPassword = PASSWORD;
    await userRepository.save(savedUser);

    const dto = new UserCreateDto();
    dto.email = EMAIL;
    dto.name = NAME;
    dto.password = PASSWORD;
    const result = await request(app.getHttpServer()).post('/user').send(dto);
    expect(result.status).toBe(HttpStatus.CONFLICT);
  });

  it('[GET] /user/{userId} : Response is OK if userId exists.', async () => {
    const savedUser = new User();
    savedUser.setEmail = EMAIL;
    savedUser.setName = NAME;
    savedUser.setPassword = PASSWORD;
    const userId = (await userRepository.save(savedUser)).getUser_id;
    const token = generateAccessToken(userId);
    const result = await request(app.getHttpServer())
      .get(`/user/${userId}`)
      .set('authorization', `Bearer ${token}`);
    expect(result.status).toBe(HttpStatus.OK);
    expect(JSON.stringify(result.body)).toBe(
      JSON.stringify(await userService.getUserInfo(userId, token)),
    );
  });

  it('[GET] /user/{userId} : Response is NOT_FOUND if userId does not exist', async () => {
    const token = generateAccessToken(-1);
    const result = await request(app.getHttpServer())
      .get('/user/-1')
      .set('authorization', `Bearer ${token}`);
    expect(result.status).toBe(HttpStatus.NOT_FOUND);
  });

  it('[GET] /user/{userId} : Response is BAD_REQUEST if authorization header is missing', async () => {
    const result = await request(app.getHttpServer()).get('/user/-1');
    expect(result.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('[GET] /user/{userId} : Response is FORBIDDEN if userId in token and userId in path parmaeter is different', async () => {
    const savedUser = new User();
    savedUser.setEmail = EMAIL;
    savedUser.setName = NAME;
    savedUser.setPassword = PASSWORD;
    const userId = (await userRepository.save(savedUser)).getUser_id;
    const token = generateAccessToken(-1);
    const result = await request(app.getHttpServer())
      .get(`/user/${userId}`)
      .set('authorization', `Bearer ${token}`);
    expect(result.status).toBe(HttpStatus.FORBIDDEN);
  });

  it('[GET] /user/{userId} : Response is UNAUTHOZIRED if token is malformed', async () => {
    const savedUser = new User();
    savedUser.setEmail = EMAIL;
    savedUser.setName = NAME;
    savedUser.setPassword = PASSWORD;
    const userId = (await userRepository.save(savedUser)).getUser_id;
    const result = await request(app.getHttpServer())
      .get(`/user/${userId}`)
      .set('authorization', `Bearer ${WRONG_TOKEN}`);
    expect(result.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('[PATCH] /user/{userId} : Response is OK if all conditions are right', async () => {
    const savedUser = new User();
    savedUser.setEmail = EMAIL;
    savedUser.setName = NAME;
    savedUser.setPassword = PASSWORD;
    const userId = (await userRepository.save(savedUser)).getUser_id;

    const token = generateAccessToken(userId);
    const updateDto = new UserUpdateDto();
    updateDto.name = 'NEW_NAME';
    updateDto.password = 'NEW_PASSWORD';

    const result = await request(app.getHttpServer())
      .patch(`/user/${userId}`)
      .set('authorization', `Bearer ${token}`)
      .send(updateDto);

    expect(result.status).toBe(HttpStatus.OK);
    const updatedUser = await userRepository.findOne(userId);
    expect(updatedUser.getName).toBe('NEW_NAME');
    expect(updatedUser.getPassword).toBe('NEW_PASSWORD');
  });

  it('[PATCH] /user/{userId} : Response is UNAUTHOZIRED if token is malformed.', async () => {
    const result = await request(app.getHttpServer())
      .patch(`/user/-1`)
      .set('authorization', `Bearer ${WRONG_TOKEN}`);
    expect(result.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('[PATCH] /user/{userId} : Response is FORBIDDEN if userId in token and userId in path parameter is different', async () => {
    const savedUser = new User();
    savedUser.setEmail = EMAIL;
    savedUser.setName = NAME;
    savedUser.setPassword = PASSWORD;
    const userId = (await userRepository.save(savedUser)).getUser_id;

    const token = generateAccessToken(-1);
    const updateDto = new UserUpdateDto();
    updateDto.name = 'NEW_NAME';
    updateDto.password = 'NEW_PASSWORD';

    const result = await request(app.getHttpServer())
      .patch(`/user/${userId}`)
      .set('authorization', `Bearer ${token}`)
      .send(updateDto);
    expect(result.status).toBe(HttpStatus.FORBIDDEN);

    const updatedUser = await userRepository.findOne(userId);
    expect(updatedUser.getName).toBe(NAME);
    expect(updatedUser.getPassword).toBe(PASSWORD);
  });

  it('[PATCH] /user/{userId} : Response is BAD_REQUEST if authorization header is missing', async () => {
    const savedUser = new User();
    savedUser.setEmail = EMAIL;
    savedUser.setName = NAME;
    savedUser.setPassword = PASSWORD;
    const userId = (await userRepository.save(savedUser)).getUser_id;

    const updateDto = new UserUpdateDto();
    updateDto.name = 'NEW_NAME';
    updateDto.password = 'NEW_PASSWORD';

    const result = await request(app.getHttpServer())
      .patch(`/user/${userId}`)
      .send(updateDto);
    expect(result.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('[DELETE] /user/{userId} : Response is OK if all conditions are right', async () => {
    const savedUser = new User();
    savedUser.setEmail = EMAIL;
    savedUser.setName = NAME;
    savedUser.setPassword = PASSWORD;
    const userId = (await userRepository.save(savedUser)).getUser_id;
    const token = generateAccessToken(userId);
    const result = await request(app.getHttpServer())
      .delete(`/user/${userId}`)
      .set('authorization', `Bearer ${token}`);
    expect(result.status).toBe(HttpStatus.OK);

    expect(await userRepository.findOne(userId)).toBeUndefined();
  });

  it('[DELETE] /user/{userId} : Response is BAD_REQUEST if authorization header is missing', async () => {
    const savedUser = new User();
    savedUser.setEmail = EMAIL;
    savedUser.setName = NAME;
    savedUser.setPassword = PASSWORD;
    const userId = (await userRepository.save(savedUser)).getUser_id;
    const result = await request(app.getHttpServer()).delete(`/user/${userId}`);
    expect(result.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('[DELETE] /user/{userId} : Response is FORBIDDEN if userId in token and userId in path parameter is different', async () => {
    const savedUser = new User();
    savedUser.setEmail = EMAIL;
    savedUser.setName = NAME;
    savedUser.setPassword = PASSWORD;
    const userId = (await userRepository.save(savedUser)).getUser_id;
    const token = generateAccessToken(-1);
    const result = await request(app.getHttpServer())
      .delete(`/user/${userId}`)
      .set('authorization', `Bearer ${token}`);
    expect(result.status).toBe(HttpStatus.FORBIDDEN);
  });

  it('[DELETE] /user/{userId} : Response is UNAUTHORIZED if token is malformed', async () => {
    const savedUser = new User();
    savedUser.setEmail = EMAIL;
    savedUser.setName = NAME;
    savedUser.setPassword = PASSWORD;
    const userId = (await userRepository.save(savedUser)).getUser_id;
    const result = await request(app.getHttpServer())
      .delete(`/user/${userId}`)
      .set('authorization', `Bearer ${WRONG_TOKEN}`);
    expect(result.status).toBe(HttpStatus.UNAUTHORIZED);
  });
});
