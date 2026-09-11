package com.lkh.test;

import io.minio.*;
import io.minio.errors.*;
import org.junit.Test;

import java.io.IOException;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;

public class MinioTest {
    @Test
    public void testMinIO(){

        MinioClient client = MinioClient.builder().endpoint("http://123.56.8.67:9000")
                .credentials("admin", "admin123456")
                .build();

        try {
            boolean exists = client.bucketExists(
                    BucketExistsArgs.builder()
                            .bucket("minio-test")
                            .build()
            );

            if (!exists) {
                client.makeBucket(
                        MakeBucketArgs.builder()
                                .bucket("minio-test")
                                .build()
                );
            }
            ObjectWriteResponse objectWriteResponse = client.uploadObject(UploadObjectArgs.builder()
                    .bucket("minio-test")
                    .filename("demolog.txt")
                    .object("pdf")
                    .build()
            );
        } catch (ErrorResponseException e) {
            throw new RuntimeException(e);
        } catch (InsufficientDataException e) {
            throw new RuntimeException(e);
        } catch (InternalException e) {
            throw new RuntimeException(e);
        } catch (InvalidKeyException e) {
            throw new RuntimeException(e);
        } catch (InvalidResponseException e) {
            throw new RuntimeException(e);
        } catch (IOException e) {
            throw new RuntimeException(e);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        } catch (ServerException e) {
            throw new RuntimeException(e);
        } catch (XmlParserException e) {
            throw new RuntimeException(e);
        }
    }
}
