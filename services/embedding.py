import asyncio
from typing import List, Dict, Optional
import numpy as np
import os
import logging
from openai import AsyncOpenAI
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.http import models

logger = logging.getLogger(__name__)

class EmbeddingService:
    def __init__(self):
        self.model = None
        self.qdrant_client = None
        self.openai_client = None
        self.collection_name = "course_documents"
        self.provider = os.getenv("EMBEDDING_MODEL_PROVIDER", "local")
        self.model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        self.vector_size = int(os.getenv("VECTOR_DIMENSION", "384"))
        
        # Set vector size based on model name for OpenAI embeddings
        if self.provider == "openai":
            if self.model_name == "text-embedding-3-small":
                self.vector_size = 1536
            elif self.model_name == "text-embedding-3-large":
                self.vector_size = 3072
            elif self.model_name == "text-embedding-ada-002":
                self.vector_size = 1536
        
    async def initialize(self):
        """Initialize the embedding model and vector database"""
        try:
            # Initialize embedding model based on provider
            if self.provider == "local":
                logger.info(f"Loading local embedding model: {self.model_name}")
                self.model = SentenceTransformer(self.model_name)
                if self.model_name == "all-MiniLM-L6-v2":
                    self.vector_size = 384
                logger.info("Local embedding model loaded successfully")
            elif self.provider == "openai":
                logger.info(f"Using OpenAI embedding model: {self.model_name}")
                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    raise ValueError("OpenAI API key not provided")
                
                # Initialize OpenAI client
                self.openai_client = AsyncOpenAI(api_key=api_key)
                
                # Test OpenAI connection
                try:
                    test_response = await self._openai_embed_text("test")
                    logger.info("OpenAI embedding service connected successfully")
                except Exception as e:
                    logger.error(f"Failed to connect to OpenAI: {e}")
                    raise
            
            # Initialize Qdrant client
            qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
            self.qdrant_client = QdrantClient(url=qdrant_url)
            
            # Create collection if it doesn't exist
            await self._ensure_collection_exists()
            logger.info("Qdrant client initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize embedding service: {e}")
            raise
    
    async def _ensure_collection_exists(self):
        """Create the collection if it doesn't exist"""
        try:
            collections = self.qdrant_client.get_collections()
            collection_names = [col.name for col in collections.collections]
            
            if self.collection_name not in collection_names:
                self.qdrant_client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=models.VectorParams(
                        size=self.vector_size,
                        distance=models.Distance.COSINE
                    )
                )
                logger.info(f"Created collection: {self.collection_name} with dimension {self.vector_size}")
            else:
                logger.info(f"Collection {self.collection_name} already exists")
                
        except Exception as e:
            logger.error(f"Error ensuring collection exists: {e}")
            raise
    
    async def _openai_embed_text(self, text: str) -> List[float]:
        """Generate embedding using OpenAI API"""
        try:
            response = await self.openai_client.embeddings.create(
                model=self.model_name,
                input=text
            )
            
            # Add null checks
            if not response or not response.data or len(response.data) == 0:
                raise ValueError("OpenAI API returned empty or invalid response")
            
            embedding = response.data[0].embedding
            if not embedding:
                raise ValueError("OpenAI API returned empty embedding")
                
            return embedding
        except Exception as e:
            logger.error(f"OpenAI embedding error: {e}")
            raise
    
    async def _openai_embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts using OpenAI API"""
        try:
            # OpenAI has a limit on batch size, so we'll process in chunks
            batch_size = 100
            all_embeddings = []
            
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i + batch_size]
                response = await self.openai_client.embeddings.create(
                    model=self.model_name,
                    input=batch
                )
                
                # Add null checks
                if not response or not response.data:
                    raise ValueError(f"OpenAI API returned empty response for batch {i//batch_size + 1}")
                
                if len(response.data) != len(batch):
                    raise ValueError(f"OpenAI API returned {len(response.data)} embeddings for {len(batch)} texts")
                
                batch_embeddings = []
                for item in response.data:
                    if not item or not item.embedding:
                        raise ValueError("OpenAI API returned empty embedding in batch")
                    batch_embeddings.append(item.embedding)
                
                all_embeddings.extend(batch_embeddings)
            
            return all_embeddings
        except Exception as e:
            logger.error(f"OpenAI batch embedding error: {e}")
            raise
    
    async def embed_text(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        try:
            if self.provider == "openai":
                return await self._openai_embed_text(text)
            else:
                if not self.model:
                    raise RuntimeError("Local embedding model not initialized")
                
                # Run embedding in thread pool to avoid blocking
                loop = asyncio.get_event_loop()
                embedding = await loop.run_in_executor(
                    None, 
                    self.model.encode, 
                    text
                )
                
                return embedding.tolist()
                
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise
    
    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        try:
            if self.provider == "openai":
                return await self._openai_embed_texts(texts)
            else:
                if not self.model:
                    raise RuntimeError("Local embedding model not initialized")
                
                # Run embedding in thread pool
                loop = asyncio.get_event_loop()
                embeddings = await loop.run_in_executor(
                    None, 
                    self.model.encode, 
                    texts
                )
                
                return embeddings.tolist()
                
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            raise
    
    async def store_embeddings(
        self, 
        chunks: List[Dict], 
        course_id: str,
        document_id: str
    ) -> List[str]:
        """Store document chunks with their embeddings in Qdrant"""
        try:
            if not chunks:
                return []
            
            # Extract texts for embedding
            texts = [chunk['content'] for chunk in chunks]
            
            # Generate embeddings
            embeddings = await self.embed_texts(texts)
            
            # Debug logging for vector dimensions
            if embeddings and len(embeddings) > 0:
                first_embedding_length = len(embeddings[0])
                logger.info(f"Embedding dimensions: {first_embedding_length}, Expected: {self.vector_size}")
                if first_embedding_length != self.vector_size:
                    logger.error(f"Vector dimension mismatch: got {first_embedding_length}, expected {self.vector_size}")
                    raise ValueError(f"Vector dimension mismatch: got {first_embedding_length}, expected {self.vector_size}")
            
            # Prepare points for Qdrant
            points = []
            vector_ids = []
            
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                # Verify embedding is a valid vector with the correct dimensions
                if not embedding or not isinstance(embedding, list):
                    logger.error(f"Invalid embedding format for chunk {i}: {type(embedding)}")
                    continue
                    
                if len(embedding) != self.vector_size:
                    logger.error(f"Incorrect embedding dimension for chunk {i}: got {len(embedding)}, expected {self.vector_size}")
                    continue
                
                vector_id = f"{document_id}_{i}"
                vector_ids.append(vector_id)
                
                point = models.PointStruct(
                    id=vector_id,
                    vector=embedding,
                    payload={
                        "course_id": course_id,
                        "document_id": document_id,
                        "chunk_index": i,
                        "content": chunk['content'],
                        "metadata": chunk.get('metadata', {}),
                        "chunk_type": chunk.get('chunk_type', 'semantic')
                    }
                )
                points.append(point)
            
            if not points:
                logger.error("No valid embeddings to store")
                return []
                
            # Store in Qdrant
            self.qdrant_client.upsert(
                collection_name=self.collection_name,
                points=points
            )
            
            logger.info(f"Stored {len(points)} embeddings for document {document_id}")
            return vector_ids
            
        except Exception as e:
            logger.error(f"Error storing embeddings: {e}")
            raise
    
    async def search_similar(
        self, 
        query: str, 
        course_id: str,
        limit: int = 10,
        score_threshold: float = 0.7
    ) -> List[Dict]:
        """Search for similar chunks in the vector database"""
        try:
            # Generate query embedding
            query_embedding = await self.embed_text(query)
            
            # Search in Qdrant
            search_result = self.qdrant_client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding,
                query_filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="course_id",
                            match=models.MatchValue(value=course_id)
                        )
                    ]
                ),
                limit=limit,
                score_threshold=score_threshold
            )
            
            # Format results
            results = []
            for hit in search_result:
                results.append({
                    "id": hit.id,
                    "score": hit.score,
                    "content": hit.payload.get("content", ""),
                    "metadata": hit.payload.get("metadata", {}),
                    "document_id": hit.payload.get("document_id"),
                    "chunk_type": hit.payload.get("chunk_type", "semantic")
                })
            
            logger.info(f"Found {len(results)} similar chunks for query in course {course_id}")
            return results
            
        except Exception as e:
            logger.error(f"Error searching similar chunks: {e}")
            raise
    
    async def delete_document_embeddings(self, document_id: str):
        """Delete all embeddings for a specific document"""
        try:
            # Delete points by document_id filter
            self.qdrant_client.delete(
                collection_name=self.collection_name,
                points_selector=models.FilterSelector(
                    filter=models.Filter(
                        must=[
                            models.FieldCondition(
                                key="document_id",
                                match=models.MatchValue(value=document_id)
                            )
                        ]
                    )
                )
            )
            
            logger.info(f"Deleted embeddings for document {document_id}")
            
        except Exception as e:
            logger.error(f"Error deleting document embeddings: {e}")
            raise
    
    async def delete_course_embeddings(self, course_id: str):
        """Delete all embeddings for a specific course"""
        try:
            # Delete points by course_id filter
            self.qdrant_client.delete(
                collection_name=self.collection_name,
                points_selector=models.FilterSelector(
                    filter=models.Filter(
                        must=[
                            models.FieldCondition(
                                key="course_id",
                                match=models.MatchValue(value=course_id)
                            )
                        ]
                    )
                )
            )
            
            logger.info(f"Deleted all embeddings for course {course_id}")
            
        except Exception as e:
            logger.error(f"Error deleting course embeddings: {e}")
            raise
    
    async def get_collection_info(self) -> Dict:
        """Get information about the vector collection"""
        try:
            info = self.qdrant_client.get_collection(self.collection_name)
            return {
                "name": info.config.name,
                "vector_size": info.config.params.vectors.size,
                "distance": info.config.params.vectors.distance,
                "points_count": info.points_count,
                "status": info.status
            }
        except Exception as e:
            logger.error(f"Error getting collection info: {e}")
            return {}
    
    async def cleanup(self):
        """Cleanup resources"""
        try:
            if self.qdrant_client:
                self.qdrant_client.close()
            logger.info("Embedding service cleaned up")
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

# Global instance
embedding_service = EmbeddingService() 